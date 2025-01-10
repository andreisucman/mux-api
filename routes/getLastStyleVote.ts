import { Router, NextFunction } from "express";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import { ObjectId } from "mongodb";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.get("/:styleId", async (req: CustomRequest, res, next: NextFunction) => {
  const { styleId } = req.params;

  if (!req.userId) {
    res.status(200).json({ message: null });
    return;
  }

  if (!styleId) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const lastVote = await doWithRetries(async () =>
      db.collection("StyleVote").findOne(
        {
          styleId: new ObjectId(styleId),
          userId: new ObjectId(req.userId),
        },
        { projection: { voteType: 1 } }
      )
    );

    const { voteType } = lastVote || { voteType: null };

    res.status(200).json({ message: voteType });
  } catch (err) {
    next(httpError(err.message, err.status));
  }
});

export default route;
