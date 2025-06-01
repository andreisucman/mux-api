import * as dotenv from "dotenv";
dotenv.config();
import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import {
  CustomRequest,
  ToAnalyzeType,
  PartEnum,
  ModerationStatusEnum,
  CategoryNameEnum,
  BlurredUrlType,
  BlurTypeEnum,
} from "types.js";
import { db } from "init.js";
import { UploadProgressUserInfo } from "@/types/uploadProgressTypes.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";
import httpError from "@/helpers/httpError.js";
import updateAnalytics from "@/functions/updateAnalytics.js";
import checkImageRequirements from "@/functions/checkImageRequirements.js";
import { validParts } from "@/data/other.js";
import checkAngleAndPartBetweenImages from "@/functions/checkAngleAndPartBetweenImages.js";

const route = Router();

export type BlurDotType = {
  id: string;
  originalWidth: number;
  originalHeight: number;
  scale: number;
  angle: number;
  x: number;
  y: number;
};

type Props = {
  image: string;
  beforeImage: string;
  part: PartEnum;
  userId: string;
  specialConsiderations: string;
  blurDots: BlurDotType[];
};

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const {
    image,
    beforeImage,
    part,
    userId,
    blurDots = [],
    specialConsiderations: newSpecialConsiderations,
  }: Props = req.body;

  const finalUserId = req.userId || userId;

  if (!image || !ObjectId.isValid(finalUserId) || !validParts.includes(part)) {
    res.status(400).json({
      message: "Bad request",
    });
    return;
  }

  try {
    const { isClearlyVisible, numberOfPeople, isMinor } = await checkImageRequirements({
      image,
      userId: finalUserId,
      categoryName: CategoryNameEnum.SCAN,
    });

    if (!isClearlyVisible) {
      res.status(200).json({
        error:
          "The image is not clear. Try taking photos in daylight with no shadows or glitter obscuring your features.",
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

    if (isMinor) {
      res.status(200).json({
        error: "The person on the image appears to be a minor.",
      });
      return;
    }

    if (beforeImage && image) {
      const { isValidForComparison } = await checkAngleAndPartBetweenImages({
        beforeImage,
        afterImage: image,
        part,
        userId: finalUserId,
        categoryName: CategoryNameEnum.SCAN,
      });

      if (!isValidForComparison) {
        res.status(200).json({
          error: "not similar",
        });
        return;
      }
    }

    const userInfo = (await doWithRetries(async () =>
      db.collection("User").findOne(
        {
          _id: new ObjectId(finalUserId),
          moderationStatus: ModerationStatusEnum.ACTIVE,
        },
        {
          projection: {
            toAnalyze: 1,
          },
        }
      )
    )) as unknown as UploadProgressUserInfo;

    if (!userInfo) throw httpError(`User ${finalUserId} not found`);

    let { toAnalyze = [] } = userInfo;

    if (toAnalyze.length > 3) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    const contentUrlTypes: BlurredUrlType[] = [{ name: "original" as "original", url: image }];
    let mainUrl = { url: image, name: "original" };

    const analyticsPayload: { [key: string]: number } = {
      [`overview.user.usage.scans.progressImageUploads.${part}`]: 1,
    };

    if (blurDots.length > 0) {
      analyticsPayload["overview.user.usage.blur.blurred"] = 1;

      const response = await doWithRetries(() =>
        fetch(`${process.env.PROCESSING_SERVER_URL}/blurImageManually`, {
          method: "POST",
          body: JSON.stringify({ blurDots, url: image }),
          headers: { "Content-Type": "application/json" },
        })
      );

      if (!response.ok) throw httpError("Network error during blur");

      const json = await response.json();

      mainUrl = {
        name: "blurred" as "blurred",
        url: json.message,
      };
      contentUrlTypes.push(mainUrl as BlurredUrlType);
    } else {
      analyticsPayload["overview.user.usage.blur.original"] = 1;
    }

    const updateUrl = { url: beforeImage, name: BlurTypeEnum.ORIGINAL };

    /* add the current uploaded info to the info to analyze */
    const newToAnalyzeObject: ToAnalyzeType = {
      part,
      createdAt: new Date(),
      mainUrl: mainUrl as BlurredUrlType,
      updateUrl,
      contentUrlTypes,
    };

    const newToAnalyze = [...toAnalyze, newToAnalyzeObject];

    let toUpdate: { $set: { [key: string]: any } } = {
      $set: {
        specialConsiderations: newSpecialConsiderations,
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
      message: newToAnalyze,
    });

    updateAnalytics({
      userId: req.userId,
      incrementPayload: analyticsPayload,
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
});

export default route;
