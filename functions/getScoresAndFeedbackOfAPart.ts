import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import {
  CategoryNameEnum,
  FormattedRatingType,
  ModerationStatusEnum,
  PartEnum,
  ProgressImageType,
  SexEnum,
  UserConcernType,
} from "types.js";
import { db } from "init.js";
import getScoresAndFeedback from "@/functions/getScoresAndFeedback.js";
import { ImageObject } from "@/functions/getScoresAndFeedback.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  part: PartEnum;
  sex: SexEnum;
  progressId: ObjectId;
  categoryName: CategoryNameEnum;
  partConcerns: UserConcernType[];
  imageObjects: ImageObject[];
};

export default async function getScoresAndFeedbackOfAPart({
  userId,
  part,
  sex,
  progressId,
  categoryName,
  partConcerns,
  imageObjects,
}: Props) {
  try {
    const initialProgress = (await doWithRetries(async () =>
      db
        .collection("Progress")
        .find({
          part,
          userId: new ObjectId(userId),
          moderationStatus: ModerationStatusEnum.ACTIVE,
        })
        .project({ scores: 1 })
        .sort({ createdAt: 1 })
        .next()
    )) as unknown as {
      _id: ObjectId;
      scores: FormattedRatingType;
      images: ProgressImageType[];
      createdAt: Date;
    };

    const result = await getScoresAndFeedback({
      categoryName,
      currentPartConcerns: partConcerns,
      part,
      sex,
      imageObjects,
      userId,
      progressIdToExclude: progressId,
      initialScores: initialProgress?.scores,
    });

    return { part, ...result };
  } catch (err) {
    throw httpError(err);
  }
}
