import * as dotenv from "dotenv";
dotenv.config();

import aqp from "api-query-params";
import { Router, Response } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { CustomRequest } from "types.js";
import { ModerationStatusEnum } from "types.js";
import { db } from "init.js";
import checkTrackedRBAC from "@/functions/checkTrackedRBAC.js";
import { ObjectId } from "mongodb";

const route = Router();

route.get("/:followingUserName", async (req: CustomRequest, res: Response) => {
  const { followingUserName } = req.params;
  const { filter, skip } = aqp(req.query);
  const { onlyCheck, showType, query } = filter || {};

  try {
    const match: { [key: string]: any } = {
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

      if (!inClub || !isFollowing || !subscriptionActive) {
        res.status(200).json({ message: [] });
        return;
      }

      if (isSelf) {
        delete match.isPublic;
        if (showType === "skipped") delete match.skipped;
        if (showType === "new") match.answer = { $exists: false };
      }
    }

    if (onlyCheck) {
      const newQuestionsCount = await doWithRetries(async () =>
        db.collection("About").countDocuments({
          userId: new ObjectId(req.userId),
          answer: { $exists: false },
          skipped: false,
        })
      );

      res
        .status(200)
        .json({ message: { hasNewQuestions: newQuestionsCount > 0 } });
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

    const proof = await doWithRetries(async () =>
      db.collection("Proof").aggregate(pipeline).toArray()
    );

    res.status(200).json({ message: proof });
  } catch (err) {
    throw httpError(err);
  }
});

export default route;
