import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import { daysFrom } from "helpers/utils.js";
import formatDate from "helpers/formatDate.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { name, avatar, intro, bio } = req.body;

    try {
      const userInfo = await doWithRetries(async () =>
        db.collection("User").findOne({ _id: new ObjectId(req.userId) })
      );

      if (!userInfo) throw httpError(`User ${req.userId} not found`);

      const { club } = userInfo;

      const { nextAvatarUpdateAt, nextNameUpdateAt } = club;

      if (name && nextNameUpdateAt > new Date()) {
        const formattedDate = formatDate({ date: nextNameUpdateAt });
        res
          .status(200)
          .json({ error: `You can update your name after ${formattedDate}.` });
        return;
      }

      if (avatar && nextAvatarUpdateAt > new Date()) {
        const formattedDate = formatDate({ date: nextNameUpdateAt });
        res.status(200).json({
          error: `You can update your avatar after ${formattedDate}.`,
        });
        return;
      }

      const payload: { [key: string]: any } = {};

      if (name) {
        payload["club.name"] = name;
        payload.nextNameUpdateAt = daysFrom({ days: 30 });
      }

      if (avatar) {
        payload["club.avatar"] = name;
        payload.nextAvatarUpdateAt = daysFrom({ days: 7 });
      }

      if (intro) payload["club.bio.about"] = intro;

      if (bio) {
        for (const key in bio) {
          payload[`club.bio.${key}`] = bio[key];
        }
      }

      await doWithRetries(async () =>
        db
          .collection("User")
          .updateOne({ _id: new ObjectId(req.userId) }, { $set: payload })
      );

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
