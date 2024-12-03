import * as dotenv from "dotenv";
dotenv.config();

import aqp from "api-query-params";
import { Router, Response } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";
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

    if (query) {
      pipeline.push({
        $text: {
          $search: `"${query}"`,
          $caseSensitive: false,
          $diacriticSensitive: false,
        },
      });
    }

    let finalFilters: { [key: string]: any } = {};

    if (concern) finalFilters.concern = concern;
    if (type) finalFilters.type = type;
    if (part) finalFilters.part = part;
    if (sex) finalFilters["demographics.sex"] = sex;
    if (bodyType) finalFilters["demographics.bodyType"] = bodyType;
    if (ageInterval) finalFilters["demographics.ageInterval"] = ageInterval;

    if (otherFilters) {
      finalFilters = { ...finalFilters, isPublic: true };
    }

    pipeline.push({ $match: finalFilters });

    if (skip) {
      pipeline.push({ $skip: skip });
    }

    pipeline.push({ $sort: { createdAt: -1 } }, { $limit: 21 });

    const proof = await doWithRetries({
      functionName: "getAllProofRecords",
      functionToExecute: async () =>
        db.collection("Proof").aggregate(pipeline).toArray(),
    });

    res.status(200).json({ message: proof });
  } catch (error) {
    addErrorLog({ functionName: "getAllProofRecords", message: error.message });
    res.status(500).json({ error: "Server error" });
  }
});

export default route;
