import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { CustomRequest, ModerationStatusEnum } from "types.js";
import createClubProfile from "functions/createClubProfile.js";
import doWithRetries from "helpers/doWithRetries.js";
import formatDate from "@/helpers/formatDate.js";
import { db } from "init.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { avatar } = req.body;
    try {
      const userInfo = await doWithRetries(async () =>
        db.collection("User").findOne(
          {
            _id: new ObjectId(req.userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          { projection: { club: 1, canRejoinClubAfter: 1 } }
        )
      );

      const { canRejoinClubAfter } = userInfo;

      if (new Date(canRejoinClubAfter || 0) > new Date()) {
        const rejoinDate = formatDate({ date: canRejoinClubAfter });
        res
          .status(200)
          .json({ error: `You can rejoin the Club after ${rejoinDate}.` });
        return;
      }

      let clubData = userInfo.club;

      if (!clubData) {
        clubData = await createClubProfile({
          userId: req.userId,
          avatar,
        });
      }

      res.status(200).json({ message: { club: clubData } });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
