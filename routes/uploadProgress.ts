import * as dotenv from "dotenv";
dotenv.config();
import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import {
  CustomRequest,
  ToAnalyzeType,
  TypeEnum,
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
import checkImagePosition from "@/functions/checkImagePosition.js";
import updateAnalytics from "@/functions/updateAnalytics.js";
import checkImageVisibility from "@/functions/checkImageVisibility.js";
import checkAndRecordTwin from "@/functions/checkAndRecordTwin.js";

const route = Router();

type Props = {
  image: string;
  blurredImage: string;
  contentUrlTypes: string[];
  type: TypeEnum;
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
      type,
      position,
      part,
      userId,
      blurType,
      specialConsiderations: newSpecialConsiderations,
    }: Props = req.body;

    const finalUserId = req.userId || userId;

    if (!image || !type || !position || !finalUserId) {
      res.status(400).json({
        message: "Bad request",
      });
      return;
    }

    try {
      const { mustLogin, isSuspended } =
        (await checkAndRecordTwin({
          image,
          category: "progress",
          payloadUserId: userId,
          requestUserId: req.userId,
          categoryName: CategoryNameEnum.PROGRESSSCAN,
        })) || {};

      console.log(
        "uploadProgress checkAndRecordTwin  { mustLogin, isSuspended }",
        {
          mustLogin,
          isSuspended,
        }
      );

      if (isSuspended) {
        res.status(200).json({
          error:
            "You can't use the platform for violating our TOS in the past. If you think this is a mistake contact us at info@muxout.com.",
        });
        return;
      }

      if (mustLogin) {
        res.status(200).json({ error: "must login" });
        return;
      }

      const isClearlyVisible = await checkImageVisibility({
        categoryName: CategoryNameEnum.PROGRESSSCAN,
        image,
        userId,
      });

      if (isClearlyVisible) {
        res.status(200).json({
          error:
            "The image is not clear. Try taking photos in daylight with no shadows obscuring your features.",
        });
        return;
      }

      const { verdict: isPosiitonValid, message: changePositionMessage } =
        await checkImagePosition({
          image,
          part,
          position,
          userId: finalUserId,
          categoryName: CategoryNameEnum.PROGRESSSCAN,
        });

      if (!isPosiitonValid) {
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
              potential: 1,
              city: 1,
              nutrition: 1,
              country: 1,
              timeZone: 1,
              nextScan: 1,
              latestProgress: 1,
              specialConsiderations: 1,
              latestScoresDifference: 1,
              currentlyHigherThan: 1,
              potentiallyHigherThan: 1,
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
        potential,
        latestProgress,
        latestScores,
        latestScoresDifference,
        currentlyHigherThan,
        potentiallyHigherThan,
      } = userInfo;

      const { canScan, canScanDate } =
        checkCanScan({ nextScan, toAnalyze, type }) || {};

      if (!canScan) {
        const date = formatDate({ date: canScanDate });
        res.status(200).json({
          error: `You have already analyzed yourself. Try again after ${date}.`,
        });
        return;
      }

      /* remove the current uploaded info from the remaining requirements */
      const typeProgressRequirements = requiredProgress[type as "head"];

      const remainingRequirements: ProgressType[] =
        typeProgressRequirements.filter(
          (record: ProgressType) =>
            record.part !== part || record.position !== position
        );

      const newRequiredProgress = {
        ...requiredProgress,
        [type]: remainingRequirements,
      };

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
        type,
        part,
        position,
        createdAt: new Date(),
        mainUrl: { url: image, name: "original" },
        contentUrlTypes,
      };

      const newTypeToAnalyze = [
        ...toAnalyze[type as "head"],
        newToAnalyzeObject,
      ];

      const newToAnalyze: { head: ToAnalyzeType[]; body: ToAnalyzeType[] } = {
        ...toAnalyze,
        [type]: newTypeToAnalyze,
      };

      let toUpdate: { $set: { [key: string]: any } } = {
        $set: {
          requiredProgress: { ...newRequiredProgress },
          toAnalyze: { ...newToAnalyze },
        },
      };

      /* when all required info is uploaded start the analysis */
      if (requiredProgress[type as "head"].length === 1) {
        await doWithRetries(async () =>
          db
            .collection("AnalysisStatus")
            .updateOne(
              { userId: new ObjectId(finalUserId), operationKey: type },
              { $set: { isRunning: true, progress: 1, isError: null } },
              { upsert: true }
            )
        );

        res.status(200).json({
          message: {
            requiredProgress: newRequiredProgress,
            toAnalyze: newToAnalyze,
          },
        });

        await analyzeAppearance({
          name,
          avatar,
          type,
          club,
          nutrition,
          userId: finalUserId,
          blurType,
          currentlyHigherThan,
          potentiallyHigherThan,
          defaultToUpdateUser: toUpdate,
          concerns: concerns || [],
          nextScan,
          potential,
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
            requiredProgress: newRequiredProgress,
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
        operationKey: type,
        userId: String(finalUserId),
        message: "An unexprected error occured. Please try again.",
        originalMessage: err.message,
      });

      next(err);
    }
  }
);

export default route;
