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
import getPurchasedFilters, { PriceDataType, PurchaseType } from "@/functions/getPurchasedFilters.js";

const route = Router();

route.get("/:userName?", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { userName } = req.params;
  const { filter, skip, sort } = aqp(req.query as any) as AqpQuery;
  const { routineId, taskKey, concern, part, query } = filter || {};

  if (!userName && !req.userId) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    let purchases: PurchaseType[] = [];
    let notPurchased: string[] = [];
    let priceData: PriceDataType[] = [];
    let proof = [];

    let match: { [key: string]: any } = {
      concern,
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

      const response = await getPurchasedFilters({
        userId: req.userId,
        userName,
        concern,
        part
      });
      purchases = response.purchases;
      priceData = response.priceData;
      notPurchased = response.notPurchased;

      if (priceData.length === 0) {
        match.isPublic = true;
      } else {
        match.$and = [
          { concern: { $in: priceData.map((o) => o.concern) } },
          { part: { $in: priceData.map((o) => o.part) } },
        ];
        if (concern) match.$and.push({ concern: { $in: [concern] } });
        if (part) match.$and.push({ part });
      }

      match = { ...match, ...response.additionalFilters };
    } else {
      if (req.userId) {
        match.userId = new ObjectId(req.userId);
        match.deletedOn = { $exists: false };
      } else {
        match.isPublic = true;
        match.deletedOn = { $exists: false };
      }
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

    proof = await doWithRetries(async () => db.collection("Proof").aggregate(pipeline).toArray());

    if (!purchases.length && userName) proof = proof.map((r) => maskProof(r as ProofType));

    res.status(200).json({
      message: { data: proof, purchases, notPurchased, priceData },
    });
  } catch (err) {
    next(err);
  }
});

export default route;
