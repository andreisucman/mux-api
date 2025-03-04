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
import formatDate from "@/helpers/formatDate.js";
import httpError from "@/helpers/httpError.js";
import updateAnalytics from "@/functions/updateAnalytics.js";
import checkAndRecordTwin from "@/functions/checkAndRecordTwin.js";
import checkImageRequirements from "@/functions/checkImageRequirements.js";
import { validParts, validPositions } from "@/data/other.js";

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

    if (
      !image ||
      !position ||
      !ObjectId.isValid(finalUserId) ||
      !validParts.includes(part) ||
      !validPositions.includes(position)
    ) {
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

      const {
        isPositionValid,
        isClearlyVisible,
        numberOfPeople,
        message: changePositionMessage,
      } = await checkImageRequirements({
        image,
        part,
        position,
        userId: finalUserId,
        categoryName: CategoryNameEnum.PROGRESSSCAN,
      });

      // if (!isClearlyVisible) {
      //   res.status(200).json({
      //     error:
      //       "The image is not clear. Try taking photos in daylight with no shadows or glitter obscuring your features.",
      //   });
      //   return;
      // }

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
              nextScan: 1,
            },
          }
        )
      )) as unknown as UploadProgressUserInfo;

      if (!userInfo) throw httpError(`User ${finalUserId} not found`);

      let { requiredProgress, toAnalyze, nextScan } = userInfo;

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
        contentUrlTypes.push({ name: "original", url: image });
        if (blurType !== "original") {
          contentUrlTypes.push({
            // for the is added to appear in the preview on the client
            name: blurType,
            url: blurredImage,
          });
        }
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
          specialConsiderations: newSpecialConsiderations,
          requiredProgress: remainingRequirements,
          toAnalyze: newToAnalyze,
        },
      };

      /* when all required info is uploaded start the analysis */
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

      updateAnalytics({
        userId: req.userId,
        incrementPayload: {
          [`overview.usage.scans.progressImageUploads.${part}`]: 1,
        },
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
