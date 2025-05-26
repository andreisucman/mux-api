import { ObjectId } from "mongodb";
import { CustomRequest, ModerationStatusEnum } from "types.js";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { db, stripe } from "init.js";
import getUserInfo from "@/functions/getUserInfo.js";
import updateAnalytics from "@/functions/updateAnalytics.js";
import { defaultClubPayoutData } from "@/data/other.js";
import httpError from "@/helpers/httpError.js";
import { payoutMinimums } from "@/data/monetization.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { newCountry } = req.body;

    if (!newCountry) {
      res.status(400).json({ message: "Bad request" });
      return;
    }

    try {
      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { "club.payouts.connectId": 1, country: 1 },
      });

      if (!userInfo) throw httpError(`User ${req.userId} not found`);

      const { country: existingCountry } = userInfo;

      const userUpdatePayload: { [key: string]: any } = {
        country: newCountry,
        "club.payouts": defaultClubPayoutData,
      };

      const payoutCountryMinimum = payoutMinimums.find(
        (obj) => obj.code.toLowerCase() === newCountry.toLowerCase()
      );
      const minPayoutAmount = payoutCountryMinimum.min + 2;
      defaultClubPayoutData.minPayoutAmount = minPayoutAmount;

      await doWithRetries(async () =>
        db.collection("User").updateOne(
          {
            _id: new ObjectId(req.userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          {
            $set: userUpdatePayload,
          }
        )
      );

      const { club } = userInfo;
      const { payouts } = club || {};
      const { connectId } = payouts || {};

      if (connectId) {
        await stripe.accounts.del(connectId);
      }

      const payload: any = {
        userId: req.userId,
        incrementPayload: { [`overview.user.club.country.${newCountry}`]: 1 },
      };

      if (existingCountry) {
        payload.decrementPayload = {
          [`overview.user.club.country.${existingCountry}`]: -1,
        };
      }

      updateAnalytics(payload);

      res.status(200).json({ message: { defaultClubPayoutData } });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
