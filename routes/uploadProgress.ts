import * as dotenv from "dotenv";
dotenv.config();
import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import {
  CustomRequest,
  ToAnalyzeType,
  PartEnum,
  BlurTypeEnum,
  ModerationStatusEnum,
  CategoryNameEnum,
} from "types.js";
import { db } from "init.js";
import {
  ProgressType,
  UploadProgressUserInfo,
} from "@/types/uploadProgressTypes.js";
import checkCanScan from "@/helpers/checkCanScan.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";
import analyzeAppearance from "functions/analyzeAppearance.js";
import formatDate from "@/helpers/formatDate.js";
import httpError from "@/helpers/httpError.js";
import updateAnalytics from "@/functions/updateAnalytics.js";
import checkAndRecordTwin from "@/functions/checkAndRecordTwin.js";
import checkImagePosition from "@/functions/checkImagePosition.js";
import checkImageRequirements from "@/functions/checkImageRequirements.js";

const route = Router();

type Props = {
  image: string;
  blurredImage: string;
  contentUrlTypes: string[];
  part: PartEnum;
  position: string;
  userId: string;
  specialConsiderations: string;
  blurType: BlurTypeEnum;
};

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const {
      image,
      blurredImage,
      position,
      part,
      userId,
      blurType,
      specialConsiderations: newSpecialConsiderations,
    }: Props = req.body;

    const finalUserId = req.userId || userId;

    if (!image || !position || !finalUserId) {
      res.status(400).json({
        message: "Bad request",
      });
      return;
    }

    try {
      const { mustLogin, isSuspended, errorMessage } =
        (await checkAndRecordTwin({
          image,
          payloadUserId: userId,
          requestUserId: req.userId,
          registryFilter: {
            category: "progress",
            part,
            position,
          },
          categoryName: CategoryNameEnum.PROGRESSSCAN,
        })) || {};

      if (errorMessage) {
        res.status(200).json({
          error: errorMessage,
        });
        return;
      }

      if (isSuspended) {
        res.status(200).json({
          error:
            "You can't use the platform for violating our TOS. For details contact us at info@muxout.com.",
        });
        return;
      }

      if (mustLogin) {
        res.status(200).json({ error: "must login" });
        return;
      }

      const { isClearlyVisible, numberOfPeople } = await checkImageRequirements(
        {
          categoryName: CategoryNameEnum.PROGRESSSCAN,
          image,
          userId,
        }
      );

      if (!isClearlyVisible) {
        res.status(200).json({
          error:
            "The image is not clear. Try taking photos in daylight with no shadows obscuring your features.",
        });
        return;
      }

      if (numberOfPeople === 0) {
        res.status(200).json({
          error: "Can't see anyone on the photo.",
        });
        return;
      }

      if (numberOfPeople > 1) {
        res.status(200).json({
          error: "There can only be one person on the photo.",
        });
        return;
      }

      const { verdict: isPositionValid, message: changePositionMessage } =
        await checkImagePosition({
          image,
          part,
          position,
          userId: finalUserId,
          categoryName: CategoryNameEnum.PROGRESSSCAN,
        });

      if (!isPositionValid) {
        res.status(200).json({ error: changePositionMessage });
        return;
      }

      const userInfo = (await doWithRetries(async () =>
        db.collection("User").findOne(
          {
            _id: new ObjectId(finalUserId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          {
            projection: {
              requiredProgress: 1,
              toAnalyze: 1,
              demographics: 1,
              concerns: 1,
              city: 1,
              nutrition: 1,
              country: 1,
              timeZone: 1,
              nextScan: 1,
              latestProgress: 1,
              specialConsiderations: 1,
              latestScoresDifference: 1,
              latestScores: 1,
              club: 1,
              name: 1,
              avatar: 1,
            },
          }
        )
      )) as unknown as UploadProgressUserInfo;

      if (!userInfo) throw httpError(`User ${finalUserId} not found`);

      let {
        name,
        avatar,
        requiredProgress,
        toAnalyze,
        club,
        nutrition,
        nextScan,
        concerns,
        demographics,
        latestProgress,
        latestScores,
        latestScoresDifference,
      } = userInfo;

      const { canScan, filteredToAnalyze, canScanDate } =
        checkCanScan({ nextScan, toAnalyze }) || {};

      if (!canScan) {
        const date = formatDate({ date: canScanDate });
        res.status(200).json({
          error: `You have already analyzed yourself. Try again after ${date}.`,
        });
        return;
      }

      /* remove the current uploaded info from the remaining requirements */
      const remainingRequirements: ProgressType[] = requiredProgress.filter(
        (record: ProgressType) =>
          record.part !== part || record.position !== position
      );

      const contentUrlTypes = [];

      if (blurType) {
        contentUrlTypes.push({
          // for the is added to appear in the preview on the client
          name: blurType,
          url: blurredImage,
        });
      }

      /* add the current uploaded info to the info to analyze */
      const newToAnalyzeObject: ToAnalyzeType = {
        part,
        position,
        createdAt: new Date(),
        mainUrl: { url: image, name: "original" },
        contentUrlTypes,
      };

      const newToAnalyze = [...filteredToAnalyze, newToAnalyzeObject];

      let toUpdate: { $set: { [key: string]: any } } = {
        $set: {
          requiredProgress: remainingRequirements,
          toAnalyze: newToAnalyze,
        },
      };

      /* when all required info is uploaded start the analysis */
      if (requiredProgress.length === 1) {
        await doWithRetries(async () =>
          db
            .collection("AnalysisStatus")
            .updateOne(
              { userId: new ObjectId(finalUserId), operationKey: "progress" },
              { $set: { isRunning: true, progress: 1, isError: null } },
              { upsert: true }
            )
        );

        res.status(200).json({
          message: {
            requiredProgress: remainingRequirements,
            toAnalyze: newToAnalyze,
          },
        });

        await analyzeAppearance({
          name,
          avatar,
          club,
          cookies: req.cookies,
          nutrition,
          userId: finalUserId,
          blurType,
          defaultToUpdateUser: toUpdate,
          concerns: concerns || [],
          nextScan,
          demographics,
          toAnalyze: newToAnalyze,
          latestScores,
          latestProgress,
          categoryName: CategoryNameEnum.PROGRESSSCAN,
          latestScoresDifference,
          newSpecialConsiderations,
        });
      } else {
        await doWithRetries(async () =>
          db.collection("User").updateOne(
            {
              _id: new ObjectId(finalUserId),
              moderationStatus: ModerationStatusEnum.ACTIVE,
            },
            toUpdate
          )
        );
        res.status(200).json({
          message: {
            requiredProgress: remainingRequirements,
            toAnalyze: newToAnalyze,
          },
        });
      }

      updateAnalytics({
        userId: req.userId,
        incrementPayload: { "overview.usage.progressScans": 1 },
      });
    } catch (err) {
      await addAnalysisStatusError({
        operationKey: "progress",
        userId: String(finalUserId),
        message: "An unexprected error occured. Please try again.",
        originalMessage: err.message,
      });

      next(err);
    }
  }
);

export default route;
