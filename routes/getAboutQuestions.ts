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
  const { filter, skip, sort } = aqp(req.query);
  const { onlyCheck, showType, query } = filter || {};

  try {
    const match: { [key: string]: any } = {
      answer: { $ne: "" },
      skipped: false,
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
        if (showType === "new") match.answer = "";
      }
    }

    if (onlyCheck) {
      const hasNewQuestionsFilters: { [key: string]: any } = {
        answer: "",
        skipped: false,
      };

      if (followingUserName) {
        hasNewQuestionsFilters.userName = followingUserName;
      } else {
        hasNewQuestionsFilters.userId = new ObjectId(req.userId);
      }

      const hasNewQuestions = await doWithRetries(async () =>
        db.collection("FaqAnswer").findOne(hasNewQuestionsFilters)
      );

      const hasAnswersFilters: { [key: string]: any } = {
        answer: { $ne: "" },
        skipped: false,
      };

      if (followingUserName) {
        hasAnswersFilters.userName = followingUserName;
      } else {
        hasAnswersFilters.userId = new ObjectId(req.userId);
      }

      const hasAnswers = await doWithRetries(async () =>
        db.collection("FaqAnswer").findOne(hasAnswersFilters)
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
          index: "faq_search_autocomplete",
          compound: {
            should: [
              {
                autocomplete: {
                  query,
                  path: "question",
                  tokenOrder: "sequential",
                },
              },
              {
                autocomplete: {
                  query,
                  path: "answer",
                  tokenOrder: "sequential",
                },
              },
            ],
          },
        },
      });
    }

    if (followingUserName) match.userName = followingUserName;

    pipeline.push({ $match: match }, { $sort: sort || { createdAt: -1 } });

    if (skip) {
      pipeline.push({ $skip: skip });
    }

    pipeline.push({ $limit: 21 });

    const questions = await doWithRetries(async () =>
      db.collection("FaqAnswer").aggregate(pipeline).toArray()
    );

    res.status(200).json({ message: { questions } });
  } catch (err) {
    throw httpError(err.message, err.status);
  }
});

export default route;
