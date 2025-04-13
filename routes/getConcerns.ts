import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest, PartEnum } from "types.js";
import { db } from "init.js";

const route = Router();

const acceptedParts = [PartEnum.FACE, PartEnum.HAIR];

route.get("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { part, q, skip } = req.query;

  if (!acceptedParts.includes(part as PartEnum)) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const pipeline = [];

    if (q) {
      pipeline.push({
        $search: {
          index: "concern_autocomplete",
          compound: {
            should: [
              {
                autocomplete: {
                  query: q,
                  path: "name",
                  tokenOrder: "sequential",
                  fuzzy: {
                    maxEdits: 1,
                  },
                },
              },
            ],
            minimumShouldMatch: 1,
          },
        },
      });
    }

    pipeline.push({ $match: { parts: { $in: [part] } } });

    if (skip) {
      pipeline.push({ $skip: Number(skip) });
    }

    pipeline.push({ $limit: 21 });

    const concerns = await doWithRetries(async () => db.collection("Concern").aggregate(pipeline).toArray());

    res.status(200).json({ message: concerns });
  } catch (err) {
    next(err);
  }
});

export default route;
