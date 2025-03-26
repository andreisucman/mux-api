import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId, Sort } from "mongodb";
import aqp, { AqpQuery } from "api-query-params";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { ModerationStatusEnum } from "types.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";
import { filterData } from "@/functions/filterData.js";
import { maskProof } from "@/helpers/mask.js";

const route = Router();

route.get(
  "/:userName?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { userName } = req.params;
    const { filter, skip, sort } = aqp(req.query as any) as AqpQuery;
    const { routineId, taskKey, concern, type, part, query } = filter || {};

    if (!userName && !req.userId) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const match: { [key: string]: any } = {
        moderationStatus: ModerationStatusEnum.ACTIVE,
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
      } else {
        match.userId = new ObjectId(req.userId);
        match.deletedOn = { $exists: false };
      }

      if (routineId) {
        match.routineId = new ObjectId(routineId);
      }

      if (taskKey) {
        match.taskKey = taskKey;
      }

      if (concern) match.concern = concern;
      if (type) match.type = type;
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

      const proof = await doWithRetries(async () =>
        db.collection("Proof").aggregate(pipeline).toArray()
      );

      let response = { priceData: null, data: proof, notPurchased: [] };

      if (userName) {
        if (proof.length) {
          const result = await filterData({
            part,
            array: proof,
            dateKey: "createdAt",
            maskFunction: maskProof,
            userId: req.userId,
          });

          response.priceData = result.priceData;
          response.data = result.data;
          response.notPurchased = result.notPurchased;
        }
      }

      res.status(200).json({ message: response });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
