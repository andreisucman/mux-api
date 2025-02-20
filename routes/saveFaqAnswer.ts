import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import moderateContent from "@/functions/moderateContent.js";
import { CustomRequest, CategoryNameEnum } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import addModerationAnalyticsData from "@/functions/addModerationAnalyticsData.js";
import addSuspiciousRecord from "@/functions/addSuspiciousRecord.js";
import createTextEmbedding from "@/functions/createTextEmbedding.js";
import { db } from "init.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { questionId, answer } = req.body;

    if (!ObjectId.isValid(questionId) || !answer) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const { isSafe, isSuspicious, moderationResults } = await moderateContent(
        {
          content: [{ type: "text", text: answer }],
        }
      );

      if (!isSafe) {
        addModerationAnalyticsData({
          categoryName: CategoryNameEnum.FAQ,
          moderationResults,
          isSuspicious,
          isSafe,
          userId: req.userId,
        });

        res.status(200).json({
          error: `It appears that your text contains profanity. Please revise it and try again.`,
        });
        return;
      }

      const questionObject = await doWithRetries(async () =>
        db
          .collection("FaqAnswer")
          .findOne(
            { _id: new ObjectId(questionId), userId: new ObjectId(req.userId) },
            { projection: { question: 1 } }
          )
      );

      if (!questionObject) return;

      const { question } = questionObject;

      const text = `Question: ${question}. Answer: ${answer}.`;

      const embedding = await createTextEmbedding({
        text,
        userId: req.userId,
        categoryName: CategoryNameEnum.FAQ,
        dimensions: 1536,
      });

      const updatePayload = {
        answer,
        embedding,
        skipped: false,
        updatedAt: new Date(),
      };

      await doWithRetries(async () =>
        db
          .collection("FaqAnswer")
          .updateOne({ _id: new ObjectId(questionId) }, { $set: updatePayload })
      );

      if (moderationResults.length > 0) {
        addModerationAnalyticsData({
          categoryName: CategoryNameEnum.FAQ,
          moderationResults,
          isSuspicious,
          isSafe,
          userId: req.userId,
        });

        if (isSuspicious) {
          addSuspiciousRecord({
            collection: "FaqAnswer",
            moderationResults,
            contentId: String(questionId),
            userId: req.userId,
          });
        }
      }

      res.status(200).json({ message: updatePayload });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
