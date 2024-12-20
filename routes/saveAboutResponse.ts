import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { db } from "init.js";
import updateAboutBio from "functions/updateAboutBio.js";
import moderateContent from "@/functions/moderateContent.js";
import { ContentModerationStatusEnum, CustomRequest } from "types.js";
import { QuestionType } from "@/types/saveAboutResponseTypes.js";
import doWithRetries from "helpers/doWithRetries.js";
import addSuspiciousRecord from "@/functions/addSuspiciousRecord.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { question, reply, audioReplies } = req.body;

    if (!reply || !question) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const { isSafe, isSuspicious, suspiciousAnalysisResults } =
        await moderateContent({
          content: [{ type: "text", text: "reply" }],
        });

      if (!isSafe) {
        res.status(200).json({
          error: `It looks like your text contains profanity. Please revise it and try again.`,
        });
        return;
      }

      const newAboutRecord = {
        _id: new ObjectId(),
        userId: new ObjectId(req.userId),
        reply,
        question,
        audioReplies,
        createdAt: new Date(),
        moderationStatus: ContentModerationStatusEnum.ACTIVE,
      };

      await doWithRetries(async () =>
        db.collection("About").insertOne(newAboutRecord)
      );

      const userInfo = await doWithRetries(async () =>
        db.collection("User").findOne(
          {
            _id: new ObjectId(req.userId),
          },
          { projection: { club: 1 } }
        )
      );

      const { club } = userInfo;
      const { bio } = club;
      const { questions } = bio;

      const newQuestions = questions.filter(
        (obj: QuestionType) => obj.question !== question
      );

      let toUpdate = { "club.bio.questions": newQuestions };

      const relevantQuestion = questions.find(
        (obj: QuestionType) => obj.question === question
      );

      if (relevantQuestion && relevantQuestion.asking === "coach") {
        const updatedBio = await updateAboutBio({
          userId: req.userId,
          currentBio: {
            philosophy: bio.philosophy,
            style: bio.style,
            tips: bio.tips,
          },
          question,
          reply,
        });

        toUpdate = {
          ...club,
          bio: { ...bio, ...updatedBio, questions: newQuestions },
        };
      }

      await doWithRetries(async () =>
        db.collection("User").updateOne(
          {
            _id: new ObjectId(req.userId),
          },
          { $set: { club: toUpdate } }
        )
      );

      if (isSuspicious) {
        addSuspiciousRecord({
          collection: "About",
          moderationResult: suspiciousAnalysisResults,
          recordId: String(newAboutRecord._id),
          userId: req.userId,
        });
      }

      res.status(200).json({ message: toUpdate });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
