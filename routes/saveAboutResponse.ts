import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import moderateContent from "@/functions/moderateContent.js";
import { CustomRequest, CategoryNameEnum } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import addModerationAnalyticsData from "@/functions/addModerationAnalyticsData.js";
import addSuspiciousRecord from "@/functions/addSuspiciousRecord.js";
import { db } from "init.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { questionId, answer } = req.body;

    if (!questionId || !answer) {
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
          userId: req.userId,
          categoryName: CategoryNameEnum.ABOUT,
          moderationResults,
          isSuspicious,
          isSafe,
        });

        res.status(200).json({
          error: `It appears that your text contains profanity. Please revise it and try again.`,
        });
        return;
      }

      const updatePayload = {
        answer,
        updatedAt: new Date(),
      };

      await doWithRetries(async () =>
        db
          .collection("About")
          .updateOne({ _id: new ObjectId(questionId) }, { $set: updatePayload })
      );

      if (moderationResults.length > 0) {
        addModerationAnalyticsData({
          userId: req.userId,
          categoryName: CategoryNameEnum.ABOUT,
          moderationResults,
          isSuspicious,
          isSafe,
        });

        if (isSuspicious) {
          addSuspiciousRecord({
            collection: "About",
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
