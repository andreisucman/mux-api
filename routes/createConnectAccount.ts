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
import { fullServceAgreementCountries } from "@/data/other.js";

const route = Router();

type Props = {
  userId: string;
  params: ConnectParamsType;
  country: string;
};

async function createAccountAndLink({ userId, params, country }: Props) {
  let account;
  let accLink;
  let errorText;

  const requiresRecipientAgreement = !fullServceAgreementCountries.includes(
    country.toUpperCase()
  );

  const updatedParams = {
    ...params,
    tos_acceptance: { service_agreement: "recipient" },
  };

  if (requiresRecipientAgreement) params = updatedParams;

  try {
    account = await stripe.accounts.create(params as any);

    accLink = await stripe.accountLinks.create({
      account: account.id,
      return_url: process.env.CLIENT_URL + "/club",
      refresh_url: process.env.CLIENT_URL + "/club",
      type: "account_onboarding",
    });
  } catch (err) {
    const contryUnavailable =
      err.raw.message.includes("Connected accounts in") &&
      err.raw.message.includes("cannot be created");

    if (contryUnavailable) {
      await doWithRetries(async () =>
        db.collection("User").updateOne(
          {
            _id: new ObjectId(userId),
          },
          {
            $set: {
              country: null,
            },
          }
        )
      );

      errorText = "Our payment processor doesn't support the selected country.";

      updateAnalytics({
        userId,
        incrementPayload: {
          [`overview.club.unsupportedCountry.${country}`]: 1,
        },
      });

      return { account, accLink, errorText };
    }

    const agreementMustBeRecipient = err.raw.message.includes(
      "`recipient` service agreement"
    );

    if (agreementMustBeRecipient) {
      return await createAccountAndLink({
        userId,
        params: updatedParams,
        country,
      });
    }

    throw err;
  }

  return { account, accLink, errorText };
}

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { email: 1, country: 1, name: 1, "club.payouts": 1 },
      });

      const { email, club, country, name } = userInfo;
      const { payouts } = club || {};
      let { connectId } = payouts || {};

      if (!connectId) {
        const params: ConnectParamsType = {
          type: "express",
          business_type: "individual",
          individual: {
            email,
          },

          country: country?.toUpperCase(),
          capabilities: {
            transfers: { requested: false },
            card_payments: { requested: false },
          },
          business_profile: {
            mcc: "5734",
            url: `https://muxout.com/club/progress/${name}`,
          },
          settings: {
            payments: {
              statement_descriptor: "MUX",
            },
          },
        };

        const { accLink, account, errorText } = await createAccountAndLink({
          userId: req.userId,
          params,
          country,
        });

        if (errorText) {
          res.status(200).json({ error: errorText });
          return;
        }

        await doWithRetries(async () =>
          db.collection("User").updateOne(
            {
              _id: new ObjectId(req.userId),
              moderationStatus: ModerationStatusEnum.ACTIVE,
            },
            { $set: { "club.payouts.connectId": account.id } }
          )
        );

        if (country) {
          updateAnalytics({
            userId: req.userId,
            incrementPayload: { [`overview.club.country.${country}`]: 1 },
          });
        }

        res.status(200).json({ message: accLink.url });
        return;
      } else {
        const account = await stripe.accounts.retrieve(connectId);

        if (!account.details_submitted) {
          const accLink = await stripe.accountLinks.create({
            account: connectId,
            return_url: process.env.CLIENT_URL + "/club",
            refresh_url: process.env.CLIENT_URL + "/club",
            type: "account_onboarding",
          });
          res.status(200).json({ message: accLink.url });
          return;
        } else {
          const loginLink = await stripe.accounts.createLoginLink(connectId);
          res.status(200).json({ message: loginLink.url });
          return;
        }
      }
    } catch (err) {
      next(err);
    }
  }
);

export default route;
