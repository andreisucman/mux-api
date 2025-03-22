import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import recalculateLatestProgress from "@/functions/recalculateLatestProgress.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import getUserInfo from "@/functions/getUserInfo.js";
import { defaultUser } from "@/data/defaultUser.js";
import { CustomRequest, ModerationStatusEnum, ProgressType } from "types.js";
import { DiaryActivityType } from "@/types/saveDiaryRecordTypes.js";
import { db } from "@/init.js";

const route = Router();

const collectionMap: { [key: string]: string } = {
  progress: "Progress",
  proof: "Proof",
  diary: "Diary",
};

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { contentId, collectionKey } = req.body;

    const allowedKeys = Object.keys(collectionMap);

    if (!allowedKeys.includes(collectionKey) || !ObjectId.isValid(contentId)) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const userInfo = await getUserInfo({ userId: req.userId });

      const recordToDelete = await doWithRetries(async () =>
        db
          .collection(collectionMap[collectionKey])
          .findOne({ _id: new ObjectId(contentId) })
      );

      await doWithRetries(async () =>
        db.collection(collectionMap[collectionKey]).updateOne(
          { _id: new ObjectId(contentId) },
          {
            $set: {
              deletedOn: new Date(),
            },
          }
        )
      );

      switch (collectionKey) {
        case "progress":
          const {
            _id: userId,
            latestScores,
            latestScoresDifference,
          } = userInfo;

          const substituteProgressRecord = (await doWithRetries(async () =>
            db
              .collection("Progress")
              .find({
                userId: new ObjectId(req.userId),
                part: recordToDelete.part,
                moderationStatus: ModerationStatusEnum.ACTIVE,
                deletedOn: { $exists: false },
              })
              .sort({ _id: -1 })
              .next()
          )) as unknown as ProgressType;

          let recalculatedData;

          if (substituteProgressRecord) {
            recalculatedData = await recalculateLatestProgress({
              latestScores,
              latestScoresDifference,
              substituteProgressRecord,
            });

            const { images, concerns, createdAt, scores, scoresDifference } =
              substituteProgressRecord;

            const toUpdatePayload = {
              scores,
              images,
              concerns,
              updatedAt: createdAt,
              scoresDifference,
            };

            await doWithRetries(() =>
              db.collection("BeforeAfter").updateOne(
                {
                  userId: new ObjectId(userId),
                  part: recordToDelete.part,
                },
                { $set: toUpdatePayload }
              )
            );
          } else {
            recalculatedData = {
              latestProgress: defaultUser.latestProgress,
              latestScores: defaultUser.latestScores,
              latestScoresDifference: defaultUser.latestScoresDifference,
            };

            await doWithRetries(() =>
              db.collection("BeforeAfter").deleteOne({
                userId: new ObjectId(userId),
                part: recordToDelete.part,
              })
            );
          }

          if (substituteProgressRecord) {
            await doWithRetries(async () =>
              db.collection("User").updateOne(
                { _id: new ObjectId(req.userId) },
                {
                  $set: recalculatedData,
                }
              )
            );
          }
          break;
        case "proof":
          const relevantDiaryRecord = await doWithRetries(async () =>
            db.collection("Diary").findOne({ "activity.contentId": contentId })
          );

          if (!relevantDiaryRecord) break;

          const { activity } = relevantDiaryRecord;

          const newActivity = activity.filter(
            (a: DiaryActivityType) => a.contentId !== contentId
          );

          await doWithRetries(async () =>
            db
              .collection("Diary")
              .updateOne(
                { _id: new ObjectId(relevantDiaryRecord._id) },
                { $set: { activity: newActivity } }
              )
          );
          break;
      }

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
