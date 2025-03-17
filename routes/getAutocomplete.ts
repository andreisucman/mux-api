import * as dotenv from "dotenv";
dotenv.config();

import aqp, { AqpQuery } from "api-query-params";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest } from "types.js";
import { ModerationStatusEnum } from "types.js";
import { db } from "init.js";
import { filterData } from "@/functions/filterData.js";

const route = Router();

const collectionsMap: { [key: string]: string } = {
  proof: "Proof",
  solution: "Solution",
  user: "User",
};

const fieldsMap: { [key: string]: string[] } = {
  proof: ["taskName", "concern"],
  solution: ["name", "nearestConcerns", "description"],
  user: ["name"],
};

const projectionMap: { [key: string]: string[] } = {
  proof: ["taskName", "concern"],
  solution: ["name", "nearestConcerns"],
  user: ["name", "avatar"],
};

const indexMap: { [key: string]: string } = {
  proof: "proof_search_autocomplete",
  solution: "solution_search_autocomplete",
  user: "user_search_autocomplete",
};

route.get(
  "/:userName?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { userName } = req.params;
    const { filter } = aqp(req.query as any) as AqpQuery;
    const { query, collection } = filter || {};

    try {
      const pipeline: any = [];

      if (query) {
        pipeline.push({
          $search: {
            index: indexMap[collection],
            compound: {
              should: fieldsMap[collection].map((field) => ({
                autocomplete: {
                  query,
                  path: field,
                  tokenOrder: "sequential",
                  fuzzy: {
                    maxEdits: 2,
                  },
                },
              })),
              minimumShouldMatch: 1,
            },
          },
        });
      }

      let match: { [key: string]: any } = {};

      if (collection !== "solution") {
        match.moderationStatus = ModerationStatusEnum.ACTIVE;
      }

      if (userName) {
        match.userName = userName;
      }

      const projection = projectionMap[collection].reduce(
        (a: { [key: string]: number }, c) => {
          a[c] = 1;
          return a;
        },
        {}
      );

      pipeline.push(
        {
          $match: match,
        },
        {
          $project: { ...projection, _id: 0 },
        },
        { $limit: 10 }
      );

      const autocompleteData = await doWithRetries(async () =>
        db.collection(collectionsMap[collection]).aggregate(pipeline).toArray()
      );

      res.status(200).json({ message: autocompleteData });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
