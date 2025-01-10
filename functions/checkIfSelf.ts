import z from "zod";
import { db } from "init.js";
import { ObjectId } from "mongodb";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import askRepeatedly from "functions/askRepeatedly.js";
import doWithRetries from "helpers/doWithRetries.js";
import { CategoryNameEnum } from "types.js";
import { ModerationStatusEnum, UserProgressRecordType } from "types.js";
import { RunType } from "types/askOpenaiTypes.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userImage?: string;
  image: string;
  userId: string;
  categoryName: CategoryNameEnum;
};

export default async function checkIfSelf({
  userImage,
  categoryName,
  image,
  userId,
}: Props) {
  let isSelf = true;

  try {
    if (!userImage) {
      const userInfo = (await doWithRetries(async () =>
        db.collection("User").findOne(
          {
            _id: new ObjectId(userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          { projection: { latestProgress: 1 } }
        )
      )) as unknown as { latestProgress: UserProgressRecordType };

      const { latestProgress } = userInfo || {};
      const { head } = latestProgress || {};
      const { face } = head || {};

      if (face) {
        const { images } = face;

        if (images) {
          const imageObject = images.find(
            (imageObj) => imageObj.position === "front"
          );

          if (imageObject) userImage = imageObject.mainUrl.url;
        }
      }
    }

    if (userImage) {
      const samePersonContent = `You are given two images. Your goal is to check if the person on each image is the same.`;

      const ModerateImagesResponseType = z
        .boolean()
        .describe("true if same, false if not");

      const runs = [
        {
          isMini: true,
          content: [
            {
              type: "image_url",
              image_url: {
                url: image,
                detail: "low",
              },
            },
            {
              type: "image_url",
              image_url: {
                url: userImage,
                detail: "low",
              },
            },
          ],
          responseFormat: zodResponseFormat(
            ModerateImagesResponseType,
            "ModerateImagesResponseType"
          ),
        },
      ];

      isSelf = await askRepeatedly({
        userId,
        categoryName,
        systemContent: samePersonContent,
        runs: runs as RunType[],
        functionName: "checkIfSelf",
      });
    }
  } catch (err) {
    throw httpError(err.message, err.status);
  } finally {
    return isSelf;
  }
}
