import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { db, stripe } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest, ModerationStatusEnum } from "types.js";
import { ConnectParamsType } from "types/createConnectAccountTypes.js";
import getUserInfo from "@/functions/getUserInfo.js";
import updateAnalytics from "@/functions/updateAnalytics.js";
import { fullServiceAgreementCountries, supportedCountries } from "@/data/other.js"; // Fixed spelling

const route = Router();

type Props = {
  userId: string;
  params: ConnectParamsType;
  country: string;
  disableRepetition?: boolean;
};

async function createAccountAndLink({ userId, params, country, disableRepetition }: Props) {
  let account;
  let accountLink;
  let errorText;

  const requiresRecipientAgreement = !fullServiceAgreementCountries.includes(country.toUpperCase());

  const createParams = requiresRecipientAgreement
    ? {
        ...params,
        tos_acceptance: { service_agreement: "recipient" },
      }
    : params;

  try {
    account = await stripe.accounts.create(createParams as any);

    accountLink = await stripe.accountLinks.create({
      account: account.id,
      return_url: `${process.env.CLIENT_URL}/club`,
      refresh_url: `${process.env.CLIENT_URL}/club`,
      type: "account_onboarding",
    });
  } catch (err) {
    const countryUnavailable =
      err.raw?.message?.includes("Connected accounts in") && err.raw.message.includes("cannot be created");

    if (countryUnavailable) {
      await doWithRetries(() =>
        db.collection("User").updateOne({ _id: new ObjectId(userId) }, { $set: { country: null } })
      );

      errorText = "Our payment processor doesn't support the selected country.";
      updateAnalytics({
        userId,
        incrementPayload: {
          [`overview.user.club.unsupportedCountry.${country}`]: 1,
        },
      });
      return { account, accountLink, errorText };
    }

    const agreementMustBeRecipient = err.raw?.message?.includes("`recipient` service agreement");

    if (agreementMustBeRecipient && !disableRepetition) {
      return createAccountAndLink({
        userId,
        params: {
          ...params,
          tos_acceptance: { service_agreement: "recipient" },
        },
        country,
        disableRepetition: true,
      });
    }

    throw err;
  }

  return { account, accountLink, errorText };
}

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    const userInfo = await getUserInfo({
      userId: req.userId,
      projection: { email: 1, country: 1, name: 1, "club.payouts": 1 },
    });

    const { email, club, country, name } = userInfo;
    const { payouts } = club || {};
    const { connectId } = payouts || {};

    if (!country) {
      res.status(200).json({ error: "Country information is required" });
      return;
    }

    const countrySupported = supportedCountries.includes(country.toUpperCase());

    if (!countrySupported) {
      res.status(200).json({
        error: `Banks from ${country} are not supported. You can create a Wise, Payoneer, or similar online banking account in USD and use their address as your country.`,
      });

      await doWithRetries(() =>
        db.collection("User").updateOne(
          {
            _id: new ObjectId(req.userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          { $unset: { country: null } }
        )
      );
      return;
    }

    if (connectId) {
      const account = await stripe.accounts.retrieve(connectId);
      if (!account.details_submitted) {
        const accountLink = await stripe.accountLinks.create({
          account: connectId,
          return_url: `${process.env.CLIENT_URL}/club`,
          refresh_url: `${process.env.CLIENT_URL}/club`,
          type: "account_onboarding",
        });
        res.json({ message: accountLink.url });
        return;
      }
      const loginLink = await stripe.accounts.createLoginLink(connectId);
      res.json({ message: loginLink.url });
      return;
    }

    const params: ConnectParamsType = {
      type: "express",
      business_type: "individual",
      individual: { email },
      country: country.toUpperCase(),
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: false },
      },
      business_profile: {
        mcc: "5734",
        url: `https://muxout.com/club/progress/${name}`,
      },
      settings: {
        payments: { statement_descriptor: "MUXOUT" },
      },
    };

    const { accountLink, account, errorText } = await createAccountAndLink({
      userId: req.userId,
      params,
      country,
    });

    if (errorText) {
      res.status(200).json({ error: errorText });
      return;
    }

    await doWithRetries(() =>
      db.collection("User").updateOne(
        {
          _id: new ObjectId(req.userId),
          moderationStatus: ModerationStatusEnum.ACTIVE,
        },
        { $set: { "club.payouts.connectId": account.id } }
      )
    );

    updateAnalytics({
      userId: req.userId,
      incrementPayload: { [`overview.user.club.country.${country}`]: 1 },
    });

    res.json({ message: accountLink.url });
  } catch (err) {
    next(err);
  }
});

export default route;
