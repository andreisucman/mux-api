import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { db } from "init.js";
import { daysFrom } from "@/helpers/utils.js";
import { CategoryNameEnum, CustomRequest, PartEnum, ScoreType, TaskStatusEnum } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import getUserInfo from "@/functions/getUserInfo.js";
import setToMidnight from "@/helpers/setToMidnight.js";
import moderateContent from "@/functions/moderateContent.js";
import createRoutineSuggestionQuestions from "@/functions/createRoutineSuggestionQuestion.js";
import getLatestTasksMap from "@/functions/getLatestTasksMap.js";

const route = Router();

type Props = {
  part: PartEnum;
  userId?: string;
  isCreate?: boolean;
  concernScores: ScoreType[];
  previousExperience: { [key: string]: string };
  questionsAndAnswers: { [key: string]: string };
  specialConsiderations?: string;
};

const validParts = [PartEnum.BODY, PartEnum.FACE, PartEnum.HAIR];

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  let {
    part,
    userId,
    isCreate,
    concernScores = [],
    previousExperience = {},
    questionsAndAnswers = {},
    specialConsiderations,
  }: Props = req.body;
  const partIsValid = validParts.includes(part);

  const finalUserId = req.userId || userId;

  if (
    !partIsValid ||
    (previousExperience && typeof previousExperience !== "object") ||
    (questionsAndAnswers && typeof questionsAndAnswers !== "object")
  ) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const experience = Object.values(previousExperience).join("\n");
    const answers = Object.values(previousExperience).join("\n");
    const text = experience + answers;

    if (text.trim()) {
      const textModerationResponse = await moderateContent({
        content: [
          {
            type: "text",
            text,
          },
        ],
      });

      if (!textModerationResponse.isSafe) {
        res
          .status(200)
          .json({ error: "Your text appears to have inappropriate language. Please revise and try again." });
        return;
      }
    }

    const now = setToMidnight({ date: new Date(), timeZone: req.timeZone });
    const lastWeek = daysFrom({ date: now, days: -7 });

    const userInfo = await getUserInfo({
      userId: finalUserId,
      projection: { concerns: 1 },
    });
    const concernNames = userInfo.concerns.map((co) => co.name);

    const sanitizedExperience = Object.fromEntries(
      Object.entries(previousExperience).filter(([concern, description]) => concernNames.includes(concern))
    );

    let sanitizedQuestionsAndAnswers = Object.fromEntries(
      Object.entries(questionsAndAnswers).map(([question, answer]) => [question.slice(0, 200), answer.slice(0, 200)])
    );

    const updatePayload: { [key: string]: any } = {};
    if (specialConsiderations) updatePayload.specialConsiderations = specialConsiderations;
    if (concernScores.length > 0) updatePayload.concernScores = concernScores;

    const experienceExists = Object.keys(sanitizedExperience).length > 0;
    if (experienceExists) updatePayload.previousExperience = sanitizedExperience;

    const latestExistingSuggestion = await doWithRetries(async () =>
      db
        .collection("RoutineSuggestion")
        .find(
          {
            userId: new ObjectId(finalUserId),
            part,
            $and: [{ createdAt: { $gte: lastWeek } }, { createdAt: { $lte: now } }],
          },
          { projection: { concernScores: 1, questionsAndAnswers: 1 } }
        )
        .sort({ createdAt: -1 })
        .next()
    );

    const createQuestions =
      concernScores.length === 0 &&
      latestExistingSuggestion?.concernScores &&
      !latestExistingSuggestion?.questionsAndAnswers;

    if (createQuestions) {
      const latestTasksMap = await getLatestTasksMap({
        userId: new ObjectId(finalUserId),
        part,
        status: TaskStatusEnum.COMPLETED,
        $and: [{ startsAt: { $gte: lastWeek } }, { startsAt: { $lte: now } }],
      });

      const questions = await createRoutineSuggestionQuestions({
        categoryName: CategoryNameEnum.TASKS,
        concernScores: latestExistingSuggestion.concernScores,
        latestTasksMap,
        specialConsiderations,
        previousExperience,
        userId: finalUserId,
        part,
      });

      sanitizedQuestionsAndAnswers = questions.reduce((a, c) => {
        a[c] = "";
        return a;
      }, {});
    }

    const questionsAndAnswersExist = Object.keys(sanitizedQuestionsAndAnswers).length > 0;
    if (questionsAndAnswersExist) updatePayload.questionsAndAnswers = sanitizedQuestionsAndAnswers;

    const updateResponse = await doWithRetries(async () =>
      db.collection("RoutineSuggestion").updateOne(
        {
          userId: new ObjectId(finalUserId),
          part,
          createdAt: now,
          $and: [{ createdAt: { $gte: lastWeek } }, { createdAt: { $lte: now } }],
        },
        {
          $set: updatePayload,
        },
        { upsert: isCreate }
      )
    );

    const message = isCreate
      ? { ...updatePayload, _id: updateResponse.upsertedId }
      : { ...latestExistingSuggestion, ...updatePayload };

    res.status(200).json(message);
  } catch (err) {
    next(err);
  }
});

export default route;
