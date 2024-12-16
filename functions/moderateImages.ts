import z from "zod";
import { db } from "init.js";
import { ObjectId } from "mongodb";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import askRepeatedly from "functions/askRepeatedly.js";
import doWithRetries from "helpers/doWithRetries.js";
import { UserProgressRecordType } from "types.js";
import { RunType } from "types/askOpenaiTypes.js";
import checkForProhibitedContent from "functions/checkForProhibitedContent.js";
import { saveLocally } from "functions/saveLocally.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userImage?: string;
  image: string;
  userId: string;
  allowOnlyUser?: boolean;
};

export default async function moderateImages({
  userImage,
  image,
  userId,
  allowOnlyUser,
}: Props) {
  try {
    const localFile = await saveLocally(image);
    const isProhibited = await checkForProhibitedContent(localFile);

    if (isProhibited) {
      return {
        status: false,
        message: "This image contains prohibited content.",
      };
    }

    if (!userImage) {
      const userInfo = (await doWithRetries(async () =>
        db
          .collection("User")
          .findOne(
            { _id: new ObjectId(userId) },
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

    if (userImage && allowOnlyUser) {
      const samePersonContent = `You are given two images. Your goal is to check if the person on each image is the same. Format your reponse as a JSON with this structure: {same: true if the same, false if not}`;

      const ModerateImagesResponseType = z.object({ same: z.boolean() });

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

      const response = await askRepeatedly({
        userId,
        systemContent: samePersonContent,
        runs: runs as RunType[],
      });

      if (!response.same) {
        return {
          status: false,
          message: "You can only upload images of yourself.",
        };
      }
    }

    return { status: true, message: "" };
  } catch (err) {
    throw httpError(err);
  }
}
