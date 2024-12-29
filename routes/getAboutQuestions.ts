import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import aqp from "api-query-params";
import { Router, Response } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { CustomRequest } from "types.js";
import { ModerationStatusEnum } from "types.js";
import checkTrackedRBAC from "@/functions/checkTrackedRBAC.js";
import { db } from "init.js";

const route = Router();

route.get("/:followingUserName?", async (req: CustomRequest, res: Response) => {
  const { followingUserName } = req.params;
  const { filter, skip } = aqp(req.query);
  const { onlyCheck, showType, query } = filter || {};

  try {
    const match: { [key: string]: any } = {
      answer: { $ne: null },
      skipped: false,
      isPublic: true,
      moderationStatus: ModerationStatusEnum.ACTIVE,
    };

    if (followingUserName) {
      const { inClub, isFollowing, isSelf, subscriptionActive } =
        await checkTrackedRBAC({
          userId: req.userId,
          followingUserName,
        });

      if (!isSelf && (!inClub || !isFollowing || !subscriptionActive)) {
        res.status(200).json({ message: { questions: [] } });
        return;
      }

      if (isSelf) {
        delete match.isPublic;
        if (showType === "skipped") {
          delete match.answer;
          match.skipped = true;
        }
        if (showType === "new") match.answer = null;
      }
    }

    if (onlyCheck) {
      const hasNewQuestionsFilters: { [key: string]: any } = {
        answer: null,
        skipped: false,
      };

      if (followingUserName) {
        hasNewQuestionsFilters.userName = followingUserName;
      } else {
        hasNewQuestionsFilters.userId = new ObjectId(req.userId);
      }

      const hasNewQuestions = await doWithRetries(async () =>
        db.collection("About").findOne(hasNewQuestionsFilters)
      );

      const hasAnswersFilters: { [key: string]: any } = {
        answer: { $ne: null },
        skipped: false,
      };

      if (followingUserName) {
        hasAnswersFilters.userName = followingUserName;
      } else {
        hasAnswersFilters.userId = new ObjectId(req.userId);
      }

      const hasAnswers = await doWithRetries(async () =>
        db.collection("About").findOne(hasAnswersFilters)
      );

      res.status(200).json({
        message: {
          hasNewQuestions: !!hasNewQuestions,
          hasAnswers: !!hasAnswers,
        },
      });
      return;
    }

    const pipeline: any = [];

    if (query) {
      pipeline.push({
        $search: {
          index: "about_search_autocomplete",
          compound: {
            should: [
              {
                autocomplete: {
                  query,
                  path: "question",
                  tokenOrder: "sequential",
                  fuzzy: {
                    maxEdits: 2,
                  },
                },
              },
              {
                autocomplete: {
                  query,
                  path: "answer",
                  tokenOrder: "sequential",
                  fuzzy: {
                    maxEdits: 2,
                  },
                },
              },
            ],
            minimumShouldMatch: 1,
          },
        },
      });
    }

    if (followingUserName) match.userName = followingUserName;

    pipeline.push({ $match: match });

    if (skip) {
      pipeline.push({ $skip: skip });
    }

    pipeline.push({ $sort: { createdAt: -1 } }, { $limit: 21 });

    const questions = await doWithRetries(async () =>
      db.collection("About").aggregate(pipeline).toArray()
    );

    res.status(200).json({ message: { questions } });
  } catch (err) {
    throw httpError(err);
  }
});

export default route;
