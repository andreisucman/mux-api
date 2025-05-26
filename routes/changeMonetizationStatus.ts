import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { db } from "init.js";
import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import getUserInfo from "@/functions/getUserInfo.js";
import checkPublishingRequirements from "@/functions/checkRoutineDataPublishingRequirements.js";
import { monetizationCountries, payoutMinimums } from "@/data/monetization.js";

const route = Router();

const now = new Date();
now.setUTCHours(0, 0, 0, 0);

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { concern, part, monetization } = req.body;

    if (!concern || !part || !monetization) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { "club.payouts.payoutsEnabled": 1, name: 1, country: 1 },
      });

      if (!userInfo.club) {
        res.status(400).json({ error: "Bad request" });
      }

      const monetizationSupported = monetizationCountries.includes(
        userInfo.country
      );

      if (!monetizationSupported) {
        const countryObj = payoutMinimums.find(
          (co) => co.code === userInfo.country
        );
        res.status(200).json({
          error: `Monetization is not supported for ${
            countryObj?.name || userInfo.country
          } yet.`,
        });
        return;
      }

      const existingRecord = await doWithRetries(async () =>
        db
          .collection("RoutineData")
          .findOne({ userId: new ObjectId(req.userId), concern, part })
      );

      if (!existingRecord) {
        res.status(200).json({ error: "Routine record not found" });
        return;
      }

      if (monetization === "enabled") {
        if (!userInfo.club.payouts.payoutsEnabled) {
          res.status(200).json({
            error:
              "You can't turn on monetization while your payouts are disabled.",
          });
          return;
        }
        const { passed, message } = await checkPublishingRequirements({
          userId: req.userId,
          part,
          concern,
        });

        if (!passed) {
          res.status(200).json({
            error: message,
          });
          return;
        }
      }

      await doWithRetries(async () =>
        db.collection("RoutineData").updateOne(
          { _id: existingRecord._id },
          {
            $set: { monetization },
          }
        )
      );

      await doWithRetries(async () =>
        db.collection("View").updateOne(
          {
            userId: new ObjectId(req.userId),
            part,
            concern,
            createdAt: { $gte: now },
          },
          {
            $set: { monetization },
          }
        )
      );

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
