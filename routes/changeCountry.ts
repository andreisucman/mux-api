import { ObjectId } from "mongodb";
import { CustomRequest, ModerationStatusEnum } from "types.js";
import { defaultClubPayoutData } from "@/functions/createClubProfile.js";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { db } from "init.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { newCountry } = req.body;
    try {
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

      res.status(200).json({ message: defaultClubPayoutData });
    } catch (error) {
      next(error);
    }
  }
);

export default route;
