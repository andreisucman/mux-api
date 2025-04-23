import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import aqp, { AqpQuery } from "api-query-params";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { ModerationStatusEnum, CustomRequest } from "types.js";
import { db } from "init.js";

const route = Router();

const collectionMap: { [key: string]: string } = {
  progress: "Progress",
  proof: "Proof",
  task: "Task",
  routine: "Routine",
  diary: "Diary",
};

const addModerationStatusCollections = ["progress", "proof", "diary"];

route.get("/:userName?", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { userName } = req.params;
  const { filter, projection } = aqp(req.query as any) as AqpQuery;
  const { collection, ...rest } = filter;

  if (!collection) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const fields = Object.keys(projection);

    let match: { [key: string]: any } = {};

    if (filter) match = { ...rest };

    if (addModerationStatusCollections.includes(collection)) match.moderationStatus = ModerationStatusEnum.ACTIVE;

    if (userName) {
      match.userName = userName;
    } else {
      match.userId = new ObjectId(req.userId);
    }

    const pipeline = [
      { $match: match },
      ...fields.map((f) => ({ $unwind: `$${f}` })),
      {
        $group: {
          _id: null,
          ...fields.reduce((a, c) => {
            a[c] = { $addToSet: `$${c}` };
            return a;
          }, {}),
        },
      },
      {
        $project: {
          _id: 0,
          ...projection,
        },
      },
    ];

    const filters = await doWithRetries(async () =>
      db.collection(collectionMap[collection]).aggregate(pipeline).next()
    );

    res.status(200).json({ message: filters });
  } catch (err) {
    next(err);
  }
});

export default route;
