import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import {
  CategoryNameEnum,
  CustomRequest,
  ModerationStatusEnum,
} from "types.js";
import { createHashKey } from "@/functions/createHashKey.js";
import createImageEmbedding from "@/functions/createImageEmbedding.js";
import checkImageSimilarity from "functions/checkImageSimilarity.js";
import analyzeCalories from "functions/analyzeCalories.js";
import doWithRetries from "helpers/doWithRetries.js";
import validateImage from "functions/validateImage.js";
import moderateContent, {
  ModerationResultType,
} from "@/functions/moderateContent.js";
import { CheckImageSimilarityProps } from "functions/checkImageSimilarity.js";
import { db } from "init.js";
import getUserInfo from "@/functions/getUserInfo.js";
import addModerationAnalyticsData from "@/functions/addModerationAnalyticsData.js";
import addSuspiciousRecord from "@/functions/addSuspiciousRecord.js";
import updateAnalytics from "@/functions/updateAnalytics.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { url } = req.body;

    try {
      if (!url) {
        res.status(400).json({ error: "Bad request" });
        return;
      }

      let isSafe = false;
      let isSuspicious = false;
      let moderationResults: ModerationResultType[] = [];

      if (req.userId) {
        const moderationResponse = await moderateContent({
          content: [{ type: "image_url", image_url: { url } }],
        });

        isSafe = moderationResponse.isSafe;
        isSuspicious = moderationResponse.isSuspicious;
        moderationResults = moderationResponse.moderationResults;

        if (!isSafe) {
          addModerationAnalyticsData({
            categoryName: CategoryNameEnum.FOODSCAN,
            isSafe,
            moderationResults,
            isSuspicious,
          });

          res.status(200).json({
            error: `It appears that this photo violates our TOS. Try a different one.`,
          });
          return;
        }
      }

      const { verdict: isValid } = await validateImage({
        condition: "This is a photo of a ready to eat food",
        image: url,
        userId: req.userId,
        categoryName: CategoryNameEnum.FOODSCAN,
      });

      if (!isValid) {
        res.status(200).json({
          error: "It must be a photo of a ready to eat food",
        });
        return;
      }

      const hash = await createHashKey(url);
      const embedding = await createImageEmbedding(
        url,
        req.userId,
        CategoryNameEnum.FOODSCAN
      );

      const checkSimilarityPayload: CheckImageSimilarityProps = {
        hash,
        embedding,
        collection: "FoodAnalysis",
        vectorIndexName: "food_image_search",
      };

      if (req.userId) checkSimilarityPayload.userId = req.userId;

      const { status: isValidSimilarity, record } = await checkImageSimilarity(
        checkSimilarityPayload
      );

      if (!isValidSimilarity) {
        res.status(200).json({
          message: {
            _id: record._id,
            url: record.url,
            analysis: record.analysis,
          },
        });
        return;
      }

      let userAbout = "";

      if (req.userId) {
        const userInfo = await getUserInfo({
          userId: req.userId,
          projection: { specialConsiderations: 1, concerns: 1 },
        });

        if (userInfo) {
          const { concerns, specialConsiderations } = userInfo;
          const activeConcerns = concerns.filter((obj) => !obj.isDisabled);
          const concernsAbout = activeConcerns.map((c) => c.name).join(", ");
          userAbout += `My concerns are: ${concernsAbout}.`;
          if (specialConsiderations) {
            userAbout += ` My special considerations are: ${specialConsiderations}.`;
          }
        }

        updateAnalytics({ "overview.usage.foodScans": 1 });
      }

      const analysis = await analyzeCalories({
        url,
        userId: req.userId,
        userAbout,
        categoryName: CategoryNameEnum.FOODSCAN,
      });

      const newRecord: { [key: string]: any } = {
        _id: new ObjectId(),
        createdAt: new Date(),
        analysis,
        url,
        embedding,
        moderationStatus: ModerationStatusEnum.ACTIVE,
        hash,
      };

      if (req.userId) newRecord.userId = new ObjectId(req.userId);

      doWithRetries(async () =>
        db.collection("FoodAnalysis").insertOne(newRecord)
      );

      if (moderationResults.length > 0) {
        addModerationAnalyticsData({
          categoryName: CategoryNameEnum.FOODSCAN,
          isSafe,
          moderationResults,
          isSuspicious,
        });

        if (isSuspicious) {
          addSuspiciousRecord({
            collection: "FoodAnalysis",
            moderationResults,
            contentId: String(newRecord._id),
            userId: req.userId,
          });
        }
      }

      res.status(200).json({
        message: {
          _id: newRecord._id,
          url: newRecord.url,
          analysis: newRecord.analysis,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
