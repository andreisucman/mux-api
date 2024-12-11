import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import checkTrackedRBAC from "functions/checkTrackedRBAC.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.get(
  "/:followingUserId?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { followingUserId } = req.params;
    const { skip, type } = req.query;

    if (!type) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      if (followingUserId) {
        const { inClub, isFollowing } = await checkTrackedRBAC({
          userId: req.userId,
          followingUserId,
        });

        if (!inClub || !isFollowing) {
          res.status(200).json({ message: [] });
          return;
        }
      }

      const finalId = followingUserId || req.userId;

      const userInfo = await doWithRetries(async () =>
        db
          .collection("User")
          .findOne(
            { _id: new ObjectId(finalId) },
            { projection: { subscriptions: 1 } }
          )
      );

      if (!userInfo) throw httpError(`User ${finalId} not found`);

      const { peek } = userInfo.subscriptions || {};
      const { validUntil } = peek || {};

      if (followingUserId) {
        if (!validUntil || new Date() > new Date(peek.validUntil)) {
          res.status(200).json({
            error: "subscription expired",
          });

          return;
        }
      }

      const routines = await doWithRetries(async () =>
        db
          .collection("Routine")
          .find({ userId: new ObjectId(finalId), type })
          .sort({ createdAt: -1 })
          .skip(Number(skip) || 0)
          .limit(9)
          .toArray()
      );

      res.status(200).json({
        message: routines,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
