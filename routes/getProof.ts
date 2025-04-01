import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId, Sort } from "mongodb";
import aqp, { AqpQuery } from "api-query-params";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { ModerationStatusEnum, ProofType } from "types.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";
import { maskProof } from "@/helpers/mask.js";
import getPurchasedFilters from "@/functions/getPurchasedFilters.js";

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
      let purchases = [];
      let proof = [];
      let notPurchased = [];
      let priceData = [];

      let match: { [key: string]: any } = {
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

        if (req.userId) {
          const response = await getPurchasedFilters({
            userId: req.userId,
            userName,
            part: filter.part,
          });
          purchases = response.purchases;
          priceData = response.priceData;
          notPurchased = response.notPurchased;
          match = { ...match, ...response.additionalFilters };
        } else {
          match.isPublic = true;
          match.deletedOn = { $exists: false };
        }
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

      proof = await doWithRetries(async () =>
        db.collection("Proof").aggregate(pipeline).toArray()
      );

      if (!purchases.length)
        proof = proof.map((r) => maskProof(r as ProofType));

      res.status(200).json({
        message: { data: proof, purchases, notPurchased, priceData },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
