import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId, Sort } from "mongodb";
import aqp, { AqpQuery } from "api-query-params";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { ModerationStatusEnum } from "types.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";

const route = Router();

route.get(
  "/:userName?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { userName } = req.params;
    const { filter, skip, sort } = aqp(req.query as any) as AqpQuery;
    const { routineId, taskKey, concern, part, query } = filter || {};

    if (!userName && !req.userId) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      let proof = [];

      let match: { [key: string]: any } = {
        concern,
        moderationStatus: ModerationStatusEnum.ACTIVE,
        deletedOn: { $exists: false },
      };

      const pipeline: any = [];

      if (query) {
        match.$text = {
          $search: `"${query}"`,
          $caseSensitive: false,
          $diacriticSensitive: false,
        };
      }

      if (userName) {
        match.userName = userName;
        match.isPublic = true;
      } else {
        if (req.userId) match.userId = new ObjectId(req.userId);
      }

      if (routineId) {
        match.routineId = new ObjectId(routineId);
      }

      if (taskKey) {
        match.taskKey = taskKey;
      }

      if (concern) match.concern = concern;
      if (part) match.part = part;

      pipeline.push(
        {
          $match: match,
        },
        { $sort: (sort as Sort) || { _id: -1 } }
      );

      if (skip) {
        pipeline.push({ $skip: skip });
      }

      pipeline.push({ $limit: 21 });

      proof = await doWithRetries(async () =>
        db.collection("Proof").aggregate(pipeline).toArray()
      );

      res.status(200).json({
        message: { data: proof },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
