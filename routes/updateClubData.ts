import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import { daysFrom } from "helpers/utils.js";
import formatDate from "helpers/formatDate.js";
import updatePublicContent from "@/functions/updatePublicContent.js";
import httpError from "@/helpers/httpError.js";
import { db } from "init.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { name, avatar, intro, bio, socials } = req.body;

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
        payload["club.nextNameUpdateAt"] = daysFrom({ days: 30 });
      }

      if (avatar) {
        payload["club.avatar"] = avatar;
        payload["club.nextAvatarUpdateAt"] = daysFrom({ days: 7 });
      }

      if (intro) payload["club.bio.intro"] = intro;

      if (socials) payload["club.bio.socials"] = socials;

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

      if (name || avatar) {
        const updatePayload: { [key: string]: any } = {};
        if (name) updatePayload.name = name;
        if (avatar) updatePayload.avatar = avatar;

        console.log("userId", req.userId, "updatePayload", updatePayload);
        updatePublicContent({ userId: req.userId, updatePayload });
      }

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
