import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { db } from "init.js";
import { AnalysisStatusEnum, CategoryNameEnum, CustomRequest, PartEnum, ScoreType, TaskStatusEnum } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import getUserInfo from "@/functions/getUserInfo.js";
import setToMidnight from "@/helpers/setToMidnight.js";
import moderateContent from "@/functions/moderateContent.js";
import createRoutineSuggestionQuestions from "@/functions/createRoutineSuggestionQuestion.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";
import { daysFrom } from "@/helpers/utils.js";
import getLatestTasksMap from "@/functions/getLatestTasksMap.js";

const route = Router();

type Props = {
  part: PartEnum;
  routineSuggestionId?: string;
  concernScores: ScoreType[];
  previousExperience: { [key: string]: string };
  questionsAndAnswers: { [key: string]: string };
};

const validParts = [PartEnum.BODY, PartEnum.FACE, PartEnum.HAIR];

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  let {
    part,
    routineSuggestionId,
    concernScores = [],
    previousExperience = {},
    questionsAndAnswers = {},
  }: Props = req.body;
  const partIsValid = validParts.includes(part);

  if (
    !partIsValid ||
    (routineSuggestionId && !ObjectId.isValid(routineSuggestionId)) ||
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
      userId: req.userId,
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
    if (concernScores.length > 0) updatePayload.concernScores = concernScores;

    const experienceExists = Object.keys(sanitizedExperience).length > 0;
    if (experienceExists) updatePayload.previousExperience = sanitizedExperience;

    const existingWithQuestionsCount = await doWithRetries(async () =>
      db.collection("RoutineSuggestion").countDocuments({
        userId: new ObjectId(req.userId),
        part,
        $and: [{ createdAt: { $gte: lastWeek } }, { createdAt: { $lte: now } }],
        questionsAndAnswers: { $exists: true },
      })
    );

    const latestExistingSuggestion = await doWithRetries(async () =>
      db
        .collection("RoutineSuggestion")
        .find(
          {
            userId: new ObjectId(req.userId),
            part,
            $and: [{ createdAt: { $gte: lastWeek } }, { createdAt: { $lte: now } }],
          },
          { projection: { concernScores: 1 } }
        )
        .sort({ createdAt: -1 })
        .next()
    );

    if (!existingWithQuestionsCount) {
      await doWithRetries(async () =>
        db.collection("AnalysisStatus").updateOne(
          {
            userId: new ObjectId(req.userId),
            operationKey: AnalysisStatusEnum.ROUTINE_SUGGESTION,
          },
          { $set: { createdAt: new Date(), progress: 0, isRunning: true }, $unset: { isError: null } },
          { upsert: true }
        )
      );
    }

    res.status(200).end();

    const createQuestions =
      concernScores.length === 0 && latestExistingSuggestion?.concernScores && !existingWithQuestionsCount;

    if (createQuestions) {
      const latestTasksMap = await getLatestTasksMap({
        userId: new ObjectId(req.userId),
        part,
        status: TaskStatusEnum.COMPLETED,
        $and: [{ startsAt: { $gte: lastWeek } }, { startsAt: { $lte: now } }],
      });

      global.startInterval(() =>
        incrementProgress({ operationKey: AnalysisStatusEnum.ROUTINE_SUGGESTION, value: 25, userId: req.userId })
      );

      const questions = await createRoutineSuggestionQuestions({
        categoryName: CategoryNameEnum.TASKS,
        concernScores: latestExistingSuggestion.concernScores,
        latestTasksMap,
        previousExperience,
        userId: req.userId,
        part,
      });

      sanitizedQuestionsAndAnswers = questions.reduce((a, c) => {
        a[c] = "";
        return a;
      }, {});

      global.stopInterval();

      await doWithRetries(async () =>
        db.collection("AnalysisStatus").updateOne(
          {
            userId: new ObjectId(req.userId),
            operationKey: AnalysisStatusEnum.ROUTINE_SUGGESTION,
          },
          { $set: { isRunning: false, progress: 0 }, $unset: { createdAt: null, isError: null } }
        )
      );
    }

    const questionsAndAnswersExist = Object.keys(sanitizedQuestionsAndAnswers).length > 0;
    if (questionsAndAnswersExist) updatePayload.questionsAndAnswers = sanitizedQuestionsAndAnswers;

    await doWithRetries(async () =>
      db.collection("RoutineSuggestion").updateOne(
        {
          userId: new ObjectId(req.userId),
          part,
          createdAt: now,
          $and: [{ createdAt: { $gte: lastWeek } }, { createdAt: { $lte: now } }],
        },
        {
          $set: updatePayload,
        },
        { upsert: true }
      )
    );
  } catch (err) {
    addAnalysisStatusError({
      operationKey: AnalysisStatusEnum.ROUTINE_SUGGESTION,
      userId: String(req.userId),
      message: "An unexpected error occured. Please try again and inform us if the error persists.",
      originalMessage: err.message,
    });
    global.stopInterval();
    next(err);
  }
});

export default route;
