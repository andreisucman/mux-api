import * as dotenv from "dotenv";
dotenv.config();
import { ObjectId } from "mongodb";
import { Router, Response } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";
import {
  CustomRequest,
  ToAnalyzeType,
  TypeEnum,
  PartEnum,
  BlurTypeEnum,
} from "types.js";
import {
  RequiredProgressType,
  UploadProgressUserInfo,
} from "@/types/uploadProgressTypes.js";
import checkCanScan from "@/helpers/checkCanScan.js";
import addAnalysisStatusError from "helpers/addAnalysisStatusError.js";
import analyzeAppearance from "functions/analyzeAppearance.js";
import formatDate from "@/helpers/formatDate.js";
import moderateImages from "functions/moderateImages.js";
import validateImagePosition from "functions/validateImagePosition.js";
import { db } from "init.js";

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

route.post("/", async (req: CustomRequest, res: Response) => {
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
    // const moderationResponse = await moderateImages({
    //   userId: String(finalUserId),
    //   image,
    //   allowOnlyUser: true,
    // });

    // console.log("moderationResponse", moderationResponse);

    // if (!moderationResponse.status) {
    //   res.status(200).json({ error: moderationResponse.message });
    //   return;
    // }

    // const positionValidationResponse = await validateImagePosition({
    //   image,
    //   part,
    //   position,
    //   userId: finalUserId,
    // });

    // console.log("positionValidationResponse", positionValidationResponse);

    // if (!positionValidationResponse.verdict) {
    //   res.status(200).json({ error: positionValidationResponse.message });
    //   return;
    // }

    console.time("uploadProgress preparation");

    const userInfo = (await doWithRetries({
      functionToExecute: async () =>
        db.collection("User").findOne(
          { _id: new ObjectId(finalUserId) },
          {
            projection: {
              requiredProgress: 1,
              toAnalyze: 1,
              demographics: 1,
              concerns: 1,
              potential: 1,
              city: 1,
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
            },
          }
        ),
      functionName: "uploadProgress",
    })) as unknown as UploadProgressUserInfo;

    if (!userInfo) throw new Error(`User ${finalUserId} not found`);

    let {
      requiredProgress,
      toAnalyze,
      club,
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
    const remainingRequirements: RequiredProgressType[] = requiredProgress[
      type as "head"
    ].filter((record: RequiredProgressType) => record.position !== position);

    const newRequiredProgress: {
      head: RequiredProgressType[];
      body: RequiredProgressType[];
    } = {
      ...requiredProgress,
      [type]: remainingRequirements,
    };

    const mainUrl = { url: image, name: "original" };
    const contentUrlTypes = [mainUrl];

    if (blurType) {
      contentUrlTypes.push({
        // for the is added to appear in the preview on the client
        name: blurType,
        url: blurredImage,
      });
    }

    /* add the current uploaded info to the info to analyze */
    const newToAnalyze: { head: ToAnalyzeType[]; body: ToAnalyzeType[] } = {
      ...toAnalyze,
      [type]: [
        ...toAnalyze[type as "head"],
        {
          type,
          part,
          position,
          createdAt: new Date(),
          mainUrl: { url: image, name: "original" },
          contentUrlTypes,
        },
      ],
    };

    let toUpdate: { $set: { [key: string]: any } } = {
      $set: {
        requiredProgress: { ...newRequiredProgress },
        toAnalyze: { ...newToAnalyze },
      },
    };

    /* when all required info is uploaded start the analysis */
    if (requiredProgress[type as "head"].length === 1) {
      await doWithRetries({
        functionName: "uploadProgress - add analysis status",
        functionToExecute: async () =>
          db
            .collection("AnalysisStatus")
            .updateOne(
              { userId: new ObjectId(finalUserId), type },
              { $set: { isRunning: true, progress: 1, isError: null } },
              { upsert: true }
            ),
      });

      res.status(200).json({
        message: {
          requiredProgress: newRequiredProgress,
          toAnalyze: newToAnalyze,
        },
      });

      await analyzeAppearance({
        type,
        club,
        userId: finalUserId,
        blurType,
        currentlyHigherThan,
        potentiallyHigherThan,
        defaultToUpdateUser: toUpdate,
        concerns,
        nextScan,
        potential,
        demographics,
        toAnalyze: newToAnalyze,
        latestScores,
        latestProgress,
        latestScoresDifference,
        newSpecialConsiderations,
      });
    } else {
      await doWithRetries({
        functionToExecute: async () =>
          db
            .collection("User")
            .updateOne({ _id: new ObjectId(finalUserId) }, toUpdate),
        functionName: "uploadProgress - update user data",
      });

      res.status(200).json({
        message: {
          requiredProgress: newRequiredProgress,
          toAnalyze: newToAnalyze,
        },
      });
    }
  } catch (error) {
    await addAnalysisStatusError({
      type,
      userId: String(finalUserId),
      message: error.message,
    });

    addErrorLog({
      functionName: "uploadProgress route",
      message: error.message,
    });
  }
});

export default route;
