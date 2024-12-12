import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response } from "express";
import { db } from "init.js";
import aqp from "api-query-params";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.get("/", async (req: CustomRequest, res: Response) => {
  const { filter, skip, projection } = aqp(req.query);
  const { query, concern, type, ...otherFilters } = filter;

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

    if (otherFilters) {
      match = { ...match, ...otherFilters };
    }

    if (concern) match.nearestConcerns = { $in: [concern] };

    match = { ...match, ...match };

    pipeline.push({ $match: match });

    if (skip) {
      pipeline.push({ $skip: skip });
    }

    let project = {};

    if (projection) {
      project = {
        name: projection.name,
        nearestConcerns: projection.nearestConcerns,
      };
    } else {
      project = {
        icon: 1,
        color: 1,
        title: 1,
        instruction: 1,
        description: 1,
        example: 1,
        name: 1,
        suggestions: 1,
        defaultSuggestions: 1,
      };
    }

    pipeline.push(
      { $sort: { createdAt: -1 } },
      {
        $project: project,
      },
      { $limit: 7 }
    );

    const solutions = await doWithRetries(async () =>
      db.collection("Solution").aggregate(pipeline).toArray()
    );

    res.status(200).json({ message: solutions });
  } catch (err) {
    throw httpError(err);
  }
});

export default route;
