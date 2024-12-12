import * as dotenv from "dotenv";
dotenv.config();

import aqp from "api-query-params";
import { Router, Response } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";

const route = Router();

route.get("/", async (req: CustomRequest, res: Response) => {
  const { filter, skip } = aqp(req.query);
  const {
    concern,
    ageInterval,
    sex,
    type,
    part,
    query,
    bodyType,
    ...otherFilters
  } = filter || {};

  try {
    const pipeline: any = [];

    let match: { [key: string]: any } = {};

    if (query) {
      match.$text = {
        $search: `"${query}"`,
        $caseSensitive: false,
        $diacriticSensitive: false,
      };
    }

    if (concern) match.concern = concern;
    if (type) match.type = type;
    if (part) match.part = part;
    if (sex) match["demographics.sex"] = sex;
    if (bodyType) match["demographics.bodyType"] = bodyType;
    if (ageInterval) match["demographics.ageInterval"] = ageInterval;

    if (otherFilters) {
      match = { ...match, isPublic: true };
    }

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
