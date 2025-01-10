import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import updateContentPublicity from "functions/updateContentPublicity.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { CustomRequest, ModerationStatusEnum } from "types.js";
import { db } from "init.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { privacy } = req.body;

    try {
      const userInfo = await doWithRetries(async () =>
        db.collection("User").findOne(
          {
            _id: new ObjectId(req.userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          { projection: { "club.payouts": 1 } }
        )
      );

      if (!userInfo) throw httpError(`User ${req.userId} not found`);
      if (!userInfo.club)
        throw httpError(`User ${req.userId} is not in the club`);

      const { club } = userInfo;
      const { payouts } = club;
      const { payoutsEnabled } = payouts;

      if (!payoutsEnabled) {
        res.status(200).json({
          error: `You can turn on data sharing after your bank account is approved. To add a bank account or see it's verification status login to your wallet.`,
        });
        return;
      }

      updateContentPublicity({
        userId: req.userId,
        newPrivacy: privacy,
      });

      res.status(200).end();
    } catch (err) {
      next(httpError(err.message, err.status));
    }
  }
);

export default route;
