import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import {
  CategoryNameEnum,
  CustomRequest,
  ModerationStatusEnum,
} from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import { daysFrom } from "helpers/utils.js";
import formatDate from "helpers/formatDate.js";
import updatePublicContent from "@/functions/updatePublicContent.js";
import httpError from "@/helpers/httpError.js";
import isNameUnique from "@/functions/isNameUnique.js";
import { db, stripe } from "init.js";
import getUserInfo from "@/functions/getUserInfo.js";
import moderateContent from "@/functions/moderateContent.js";
import addSuspiciousRecord from "@/functions/addSuspiciousRecord.js";

type HandleCheckSafetyProps = {
  req: CustomRequest;
  res: Response;
  text: string;
  key: string;
};

const handleCheckSafety = async ({
  req,
  res,
  text,
  key,
}: HandleCheckSafetyProps) => {
  try {
    const { isSafe, isSuspicious, moderationResults } = await moderateContent({
      content: [{ type: "text", text }],
    });

    if (!isSafe) {
      res.status(200).json({
        error: `It looks like your text contains profanity. Please revise it and try again.`,
      });
      return false;
    }

    if (moderationResults.length > 0) {
      if (isSuspicious) {
        addSuspiciousRecord({
          collection: "User",
          moderationResults,
          contentId: req.userId,
          userId: req.userId,
          key,
        });
      }
    }

    return true;
  } catch (err) {
    throw httpError(err);
  }
};

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
      }

      if (name) {
        const verdict = await handleCheckSafety({
          req,
          res,
          text: name,
          key: "name",
        });
        if (!verdict) return;

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
        const { connectId } = payouts || {};

        if (connectId) {
          await doWithRetries(() =>
            stripe.accounts.update(connectId, {
              business_profile: {
                url: `https://muxout.com/club/${name}`,
              },
            })
          );
        }
      }

      if (intro) {
        const verdict = await handleCheckSafety({
          req,
          res,
          text: intro,
          key: "club.bio.intro",
        });
        if (!verdict) return;

        updatePayload["club.bio.intro"] = intro;
      }
      if (socials) {
        const verdict = await handleCheckSafety({
          req,
          res,
          text: JSON.stringify(socials),
          key: "club.bio.socials",
        });
        if (!verdict) return;
        updatePayload["club.bio.socials"] = socials;
      }

      if (bio) {
        for (const key in bio) {
          const verdict = await handleCheckSafety({
            req,
            res,
            text: JSON.stringify(socials),
            key: `club.bio.${key}`,
          });
          if (!verdict) return;
          updatePayload[`club.bio.${key}`] = bio[key];
        }
      }

      await doWithRetries(async () =>
        db.collection("User").updateOne(
          {
            _id: new ObjectId(req.userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          { $set: updatePayload }
        )
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
