import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { db } from "init.js";
import moderateContent from "@/functions/moderateContent.js";
import { CustomRequest, CategoryNameEnum } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import generateBioContent from "@/functions/generateBioContent.js";
import addModerationAnalyticsData from "@/functions/addModerationAnalyticsData.js";
import addSuspiciousRecord from "@/functions/addSuspiciousRecord.js";

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
      const relatedAnswers = await doWithRetries(async () =>
        db
          .collection("About")
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
            {
              $project: {
                coach: { $ifNull: [{ $arrayElementAt: ["$coach", 0] }, []] },
                other: { $ifNull: [{ $arrayElementAt: ["$other", 0] }, []] },
              },
            },
          ])
          .next()
      );

      const { coach, other } = relatedAnswers;

      const generatedContent = await generateBioContent({
        categoryName: CategoryNameEnum.ABOUT,
        segment,
        text,
        userId: req.userId,
      });

      res.status(200).json({ message: updatePayload });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
