import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import aqp from "api-query-params";
import { Router, Response } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";
import { CustomRequest } from "types.js";
import checkTrackedRBAC from "functions/checkTrackedRBAC.js";
import { db } from "init.js";

const route = Router();

route.get("/:userId?", async (req: CustomRequest, res: Response) => {
  const { userId } = req.params;
  const { filter } = aqp(req.query);
  const { query } = filter || {};

  if (userId) {
    await checkTrackedRBAC({ trackedUserId: userId, userId: req.userId });
  }

  let finalUserId = userId || req.userId;

  if (!finalUserId) {
    res.status(400).json({ error: "Bad request" });
  }

  try {
    const pipeline: any = [];

    let match: { [key: string]: any } = {};

    if (query) {
      match = {
        $text: {
          $search: `"${query}"`,
          $caseSensitive: false,
          $diacriticSensitive: false,
        },
      };
    }

    pipeline.push(
      {
        $match: { ...match, userId: new ObjectId(finalUserId), isPublic: true },
      },
      {
        $project: {
          taskName: 1,
          concern: 1,
          type: 1,
          part: 1,
        },
      }
    );

    const autocompleteData = await doWithRetries({
      functionName: "getProofAutocomplete - aggregate",
      functionToExecute: async () =>
        db.collection("Proof").aggregate(pipeline).toArray(),
    });

    res.status(200).json({ message: autocompleteData });
  } catch (error) {
    addErrorLog({
      functionName: "getUsersProofAutocomplete",
      message: error.message,
    });
    res.status(500).json({ error: "Server error" });
  }
});

export default route;
