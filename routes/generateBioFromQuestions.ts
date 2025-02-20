import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { db } from "init.js";
import { CustomRequest, CategoryNameEnum } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import generateBioContent from "@/functions/generateBioContent.js";
import { daysFrom } from "@/helpers/utils.js";
import getUserInfo from "@/functions/getUserInfo.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { segment } = req.body;

    if (!segment) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { [`club.bio.nextRegenerateBio.${segment}`]: 1 },
      });

      const { club } = userInfo || {};
      const { bio } = club || {};
      const { nextRegenerateBio } = bio || {};
      const nextCanGenerateDate = nextRegenerateBio[segment as "philosophy"];

      if (new Date() < new Date(nextCanGenerateDate)) {
        res.status(400).json({ error: "Bad request" });
        return;
      }

      const relatedAnswers = await doWithRetries(async () =>
        db
          .collection("FaqAnswer")
          .aggregate([
            {
              $facet: {
                coach: [
                  {
                    $match: {
                      userId: new ObjectId(req.userId),
                      asking: "coach",
                    },
                  },
                  {
                    $project: {
                      question: 1,
                      answer: 1,
                    },
                  },
                ],
                other: [
                  {
                    $match: {
                      userId: new ObjectId(req.userId),
                      asking: { $ne: "coach" },
                    },
                  },
                  {
                    $project: {
                      question: 1,
                      answer: 1,
                    },
                  },
                  { $sort: { _id: -1 } },
                ],
              },
            },
          ])
          .next()
      );

      const { coach, other } = relatedAnswers;

      let text = "";

      const allReplies = [...coach, ...other].filter((r) => !!r.answer);

      for (const record of allReplies) {
        text += `Question: ${record.question}\nUser replies: ${record.answer}\n\n`;
      }

      const generatedContent = await generateBioContent({
        userId: req.userId,
        categoryName: CategoryNameEnum.FAQ,
        segment,
        text,
      });

      const nextDate = daysFrom({
        days: 7,
      });

      await doWithRetries(async () =>
        db.collection("User").updateOne(
          { _id: new ObjectId(req.userId) },
          {
            $set: {
              [`club.bio.nextRegenerateBio.${segment}`]: nextDate,
            },
          }
        )
      );

      res.status(200).json({
        message: {
          content: generatedContent,
          nextRegenerateBio: { [segment]: nextDate },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
