import { ObjectId } from "mongodb";
import { Router } from "express";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import checkTrackedRBAC from "functions/checkTrackedRBAC.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.get("/:followingUserId?", async (req: CustomRequest, res) => {
  const { type, part, skip } = req.query;
  const { followingUserId } = req.params;

  const finalUserId = followingUserId || req.userId;

  if (!ObjectId.isValid(finalUserId)) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    if (followingUserId)
      await checkTrackedRBAC({
        userId: req.userId,
        followingUserId,
      });

    const filter: { [key: string]: any } = {
      userId: new ObjectId(finalUserId),
    };

    if (type) filter.type = type;
    if (part) filter.part = part;

    const projection: { [key: string]: any } = {
      _id: 1,
      type: 1,
      part: 1,
      isPublic: 1,
      images: 1,
      initialImages: 1,
      scores: 1,
      createdAt: 1,
      scoresDifference: 1,
      initialDate: 1,
      userId: 1,
    };

    const progress = await doWithRetries(async () =>
      db
        .collection("Progress")
        .find(filter, {
          projection,
        })
        .sort({ createdAt: -1 })
        .skip(Number(skip) || 0)
        .limit(7)
        .toArray()
    );

    res.status(200).json({ message: progress });
  } catch (err) {
    throw httpError(err);
  }
});

export default route;
