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
  "/:trackedUserId?/:type?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { trackedUserId, type } = req.params;
    const { skip } = req.query;

    if (!type || !trackedUserId || !ObjectId.isValid(trackedUserId)) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      await checkTrackedRBAC({
        userId: req.userId,
        trackedUserId,
        userProjection: { subsciptions: 1 },
      });

      const userInfo = await doWithRetries({
        functionName: "getTrackedRoutines - get user",
        functionToExecute: async () =>
          db
            .collection("User")
            .findOne(
              { _id: new ObjectId(trackedUserId) },
              { projection: { subscriptions: 1 } }
            ),
      });

      if (!userInfo) throw httpError(`User ${trackedUserId} not found`);

      const { peek } = userInfo.subscriptions || {};
      const { validUntil } = peek || {};

      if (!validUntil || new Date() > new Date(peek.validUntil)) {
        res.status(200).json({
          error: "subscription expired",
        });

        return;
      }

      const routines = await doWithRetries({
        functionName: "getTrackedRoutines",
        functionToExecute: async () =>
          db
            .collection("Routine")
            .find({ userId: new ObjectId(trackedUserId), type })
            .sort({ createdAt: -1 })
            .skip(Number(skip) || 0)
            .limit(9)
            .toArray(),
      });

      res.status(200).json({
        message: routines,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
