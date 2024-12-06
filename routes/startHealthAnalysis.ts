import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { BlurTypeEnum, CustomRequest, TypeEnum } from "types.js";
import { UploadProgressUserInfo } from "types/uploadProgressTypes.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";
import analyzeAppearance from "functions/analyzeAppearance.js";
import formatDate from "@/helpers/formatDate.js";
import checkCanScan from "@/helpers/checkCanScan.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";
import { StartHealthAnalysisUserInfo } from "@/types/startHealthAnalysisTypes.js";

const route = Router();

type Props = {
  type: TypeEnum;
  userId: string;
  blurType: BlurTypeEnum;
};

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { userId, type }: Props = req.body;

    const finalUserId = req.userId || userId;

    if (!finalUserId || !type) {
      res.status(400).json({
        message: `userId: ${finalUserId}, type: ${type} is missing`,
      });
      return;
    }

    try {
      // const moderationResponse = await moderateImages({
      //   userId: String(userId),
      //   image,
      // });

      // if (!moderationResponse.status) {
      //   res.status(200).json({ error: moderationResponse.message });
      //   return;
      // }

      const userInfo = (await doWithRetries(async () =>
        db.collection("User").findOne(
          { _id: new ObjectId(finalUserId) },
          {
            projection: {
              requiredProgress: 1,
              "toAnalyze.health": 1,
              concerns: 1,
              demographics: 1,
              nextScan: 1,
              specialConsiderations: 1,
            },
          }
        )
      )) as unknown as StartHealthAnalysisUserInfo;

      if (!userInfo) throw httpError(`No userInfo for ${finalUserId}`);

      let { toAnalyze, nextScan, concerns, demographics } = userInfo;

      const toAnalyzeObjects = toAnalyze.health;

      const toUpdateUser = { $set: {} as { [key: string]: any } };

      // const { canScan, canScanDate } =
      //   checkCanScan({ nextScan, toAnalyze, type }) || {};

      // if (!canScan) {
      //   const date = formatDate({ date: canScanDate });
      //   res.status(200).json({
      //     error: `You have already analyzed yourself. Try again after ${date}.`,
      //   });
      //   return;
      // }

      await doWithRetries(async () =>
        db
          .collection("AnalysisStatus")
          .updateOne(
            { userId: new ObjectId(finalUserId), operationKey: type },
            { $set: { isRunning: true, progress: 1, isError: null } },
            { upsert: true }
          )
      );

      res.status(200).end();
    } catch (error) {
      await addAnalysisStatusError({
        operationKey: type,
        userId: String(finalUserId),
        message: error.message,
      });
    }
  }
);

export default route;
