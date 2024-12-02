import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response } from "express";
import { db } from "init.js";
import updateAboutBio from "functions/updateAboutBio.js";
import { CustomRequest } from "types.js";
import { QuestionType } from "@/types/saveAboutResponseTypes.js";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response) => {
  const { question, reply, audioReplies } = req.body;

  try {
    const newAboutRecord = {
      userId: new ObjectId(req.userId),
      reply,
      question,
      audioReplies,
      createdAt: new Date(),
    };

    await doWithRetries({
      functionName: "saveAboutResponse - add about record",
      functionToExecute: async () =>
        db.collection("About").insertOne(newAboutRecord),
    });

    const userInfo = await doWithRetries({
      functionName: "saveAboutResponse - get user info",
      functionToExecute: async () =>
        db.collection("User").findOne(
          {
            _id: new ObjectId(req.userId),
          },
          { projection: { club: 1 } }
        ),
    });

    if (!userInfo) throw new Error("userInfo not found");

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
          about: bio.about,
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

    await doWithRetries({
      functionName: "saveAboutResponse - update user",
      functionToExecute: async () =>
        db.collection("User").updateOne(
          {
            _id: new ObjectId(req.userId),
          },
          { $set: { club: toUpdate } }
        ),
    });

    res.status(200).json({ message: toUpdate });
  } catch (error) {
    addErrorLog({ functionName: "saveAboutResponse", message: error.message });
    res.status(500).json({ error: "Server error" });
  }
});

export default route;
