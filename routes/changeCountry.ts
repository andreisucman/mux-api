import { ObjectId } from "mongodb";
import { CustomRequest, ModerationStatusEnum } from "types.js";
import { defaultClubPayoutData } from "@/functions/createClubProfile.js";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { db, stripe } from "init.js";
import getUserInfo from "@/functions/getUserInfo.js";
import updateAnalytics from "@/functions/updateAnalytics.js";
import { defaultClubPrivacy } from "@/data/defaultClubPrivacy.js";
import httpError from "@/helpers/httpError.js";
import updateContentPublicity from "@/functions/updateContentPublicity.js";

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

      updateContentPublicity({
        userId: req.userId,
        newPrivacy: defaultClubPrivacy,
      });

      await doWithRetries(async () =>
        db.collection("User").updateOne(
          {
            _id: new ObjectId(req.userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          {
            $set: {
              country: newCountry,
              "club.payouts": defaultClubPayoutData,
            },
          }
        )
      );

      const { club } = userInfo;
      const { payouts } = club || {};
      const { connectId } = payouts || {};

      if (connectId) {
        await stripe.accounts.del(connectId);
      }

      if (!existingCountry) {
        updateAnalytics({
          userId: req.userId,
          incrementPayload: { [`overview.club.country.${newCountry}`]: 1 },
        });
      }

      res
        .status(200)
        .json({ message: { defaultClubPayoutData, defaultClubPrivacy } });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
