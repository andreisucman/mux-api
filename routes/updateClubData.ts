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
import isNameUnique from "@/functions/isNameUnique.js";
import { db, stripe } from "init.js";
import getUserInfo from "@/functions/getUserInfo.js";
import moderateTextProfanity from "@/functions/moderateTextProfanity.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { name, avatar, intro, bio, socials } = req.body;

    try {
      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: {
          nextNameUpdateAt: 1,
          nextAvatarUpdateAt: 1,
          "club.payouts.connectId": 1,
        },
      });

      if (!userInfo) throw httpError(`User ${req.userId} not found`);

      const { nextAvatarUpdateAt, nextNameUpdateAt } = userInfo;

      const updatePayload: { [key: string]: any } = {};

      if (avatar) {
        if (nextAvatarUpdateAt > new Date()) {
          const formattedDate = formatDate({ date: nextNameUpdateAt });
          res.status(200).json({
            error: `You can update your avatar after ${formattedDate}.`,
          });
          return;
        }

        updatePayload.avatar = avatar;
        updatePayload.nextAvatarUpdateAt = daysFrom({ days: 7 });
      }

      if (name || intro || socials || bio) {
        let text = "";
        if (name) text += `<-->${name}<-->`;
        if (intro) text += `<-->${intro}<-->`;
        if (socials) text += `<-->${JSON.stringify(socials)}<-->`;
        if (bio) text += `<-->${JSON.stringify(bio)}<-->`;

        const { containsProfanity } = await moderateTextProfanity({
          userId: req.userId,
          text,
        });

        if (containsProfanity) {
          res.status(200).json({
            error: `It looks like your text contains profanity. Please revise it and try again.`,
          });
          return;
        }
      }

      if (name) {
        if (nextNameUpdateAt > new Date()) {
          const formattedDate = formatDate({ date: nextNameUpdateAt });
          res.status(200).json({
            error: `You can update your name after ${formattedDate}.`,
          });
          return;
        }

        const isUnique = await isNameUnique(name);

        if (!isUnique) {
          res.status(200).json({
            error: `A user with this name already exists. Choose a different name.`,
          });
          return;
        }

        updatePayload.name = name.split(" ").join("_");
        updatePayload.nextNameUpdateAt = daysFrom({ days: 30 });

        const { club } = userInfo;

        const { payouts } = club || {};
        const { connectId } = payouts;

        await doWithRetries(() =>
          stripe.accounts.update(connectId, {
            business_profile: {
              url: `${process.env.CLIENT_URL}/club/${name}`,
            },
          })
        );
      }

      if (intro) {
        updatePayload["club.bio.intro"] = intro;
      }
      if (socials) {
        updatePayload["club.bio.socials"] = socials;
      }

      if (bio) {
        for (const key in bio) {
          updatePayload[`club.bio.${key}`] = bio[key];
        }
      }

      await doWithRetries(async () =>
        db
          .collection("User")
          .updateOne({ _id: new ObjectId(req.userId) }, { $set: updatePayload })
      );

      if (name || avatar) {
        const updatePublicityPayload: { [key: string]: any } = {};
        if (name) updatePublicityPayload.userName = name;
        if (avatar) updatePublicityPayload.avatar = avatar;

        updatePublicContent({
          userId: req.userId,
          updatePayload: updatePublicityPayload,
        });
      }

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
