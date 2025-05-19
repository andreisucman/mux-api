import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { db } from "init.js";
import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import updateContent from "@/functions/updateContent.js";
import getUserInfo from "@/functions/getUserInfo.js";
import publishBeforeAfter from "@/functions/publishBeforeAfter.js";

export type RoutineDataType = {
  concern: string;
  part: string;
  status: string;
  userId: ObjectId;
  userName: string;
  monetization?: "enabled" | "disabled";
};

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { concern, part, status } = req.body;

    if (!concern || !part) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { "club.payouts.payoutsEnabled": 1, name: 1 },
      });

      if (!userInfo.club) {
        res.status(400).json({ error: "Bad request" });
      }

      const updatePayload: { [key: string]: any } = {
        status,
        userName: userInfo.name,
      };

      if (status === "hidden") updatePayload.monetization = "disabled";

      if (status === "public") {
        const concernBeforeAfterCount = await doWithRetries(() =>
          db.collection("BeforeAfter").countDocuments({
            userId: new ObjectId(req.userId),
            concerns: { $in: [concern] },
            part,
          })
        );

        if (concernBeforeAfterCount === 0) {
          const { name: userName, avatar } =
            (await getUserInfo({
              userId: req.userId,
              projection: { name: 1, avatar: 1 },
            })) || {};

          publishBeforeAfter({
            userId: req.userId,
            userName,
            avatar,
            concern,
            part,
            isPublic: status === "public",
          });
        }
      }

      res.status(200).end();

      const contentPayload: { [key: string]: any } = {
        isPublic: status === "public",
      };

      await updateContent({
        collections: ["Proof", "Diary", "BeforeAfter"],
        updatePayload: contentPayload,
        filter: {
          userId: new ObjectId(req.userId),
          concern,
        },
      });

      await updateContent({
        collections: ["Routine", "Progress"],
        updatePayload: contentPayload,
        filter: {
          userId: new ObjectId(req.userId),
          concerns: { $in: [concern] },
        },
      });

      await doWithRetries(async () =>
        db.collection("RoutineData").updateOne(
          { userId: new ObjectId(req.userId), concern, part },
          {
            $set: updatePayload,
          },
          { upsert: true }
        )
      );

      const publicRoutinesCount = await doWithRetries(async () =>
        db.collection("RoutineData").countDocuments({
          userId: new ObjectId(req.userId),
          status: "public",
        })
      );

      const isUserPublic =
        publicRoutinesCount > 0 ? true : status === "public" ? true : false;

      await doWithRetries(() =>
        db
          .collection("User")
          .updateOne(
            { _id: new ObjectId(req.userId) },
            { $set: { isPublic: isUserPublic } }
          )
      );
    } catch (err) {
      next(err);
    }
  }
);

export default route;
