import z from "zod";
import { db } from "init.js";
import { ObjectId } from "mongodb";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import askRepeatedly from "functions/askRepeatedly.js";
import doWithRetries from "helpers/doWithRetries.js";
import { CategoryNameEnum, LatestProgressType } from "types.js";
import { ModerationStatusEnum } from "types.js";
import { RunType } from "types/askOpenaiTypes.js";
import httpError from "@/helpers/httpError.js";
import { urlToBase64 } from "@/helpers/utils.js";
import createImageCollage from "./createImageCollage.js";

type Props = {
  userImage?: string;
  image: string;
  userId: string;
  categoryName: CategoryNameEnum;
};

export default async function checkIfSelf({ userImage, categoryName, image, userId }: Props) {
  let isSelf = true;

  try {
    if (!userImage) {
      const userInfo = (await doWithRetries(async () =>
        db.collection("User").findOne(
          {
            _id: new ObjectId(userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          { projection: { initialProgressImages: 1 } }
        )
      )) as unknown as { initialProgressImages: LatestProgressType };

      const { initialProgressImages } = userInfo || {};
      const { face } = initialProgressImages || {};

      if (face) {
        const { images } = face;

        if (images) {
          userImage = await createImageCollage({
            images: images.map((isObj) => isObj.mainUrl.url),
            collageSize: 1024,
          });
        }
      }
    }

    if (userImage) {
      const samePersonContent = `You are given two images. One is a collage, the other is single image. Your goal is to check if the person on the single image and the person on the collage are same people.`;

      const ModerateImagesResponseType = z.boolean().describe("true if same, false if not");

      const runs = [
        {
          model: "gpt-4o-mini",
          content: [
            {
              type: "image_url",
              image_url: {
                url: await urlToBase64(image),
                detail: "low",
              },
            },
            {
              type: "image_url",
              image_url: {
                url: await urlToBase64(userImage),
                detail: "low",
              },
            },
          ],
          responseFormat: zodResponseFormat(ModerateImagesResponseType, "ModerateImagesResponseType"),
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
    throw httpError(err);
  } finally {
    return isSelf;
  }
}
