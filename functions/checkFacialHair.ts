import httpError from "@/helpers/httpError.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import { urlToBase64 } from "@/helpers/utils.js";
import { CategoryNameEnum, ProgressImageType } from "@/types.js";
import askRepeatedly from "./askRepeatedly.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { z } from "zod";

type Props = {
  userId: string;
  partImages: ProgressImageType[];
  incrementMultiplier?: number;
  categoryName: CategoryNameEnum;
};

export default async function checkFacialHair({
  userId,
  categoryName,
  partImages,
  incrementMultiplier = 1,
}: Props) {
  try {
    const relevantImage = partImages.find((imo) => imo.position === "front");

    const FacialHairCheckResponseType = z.object({
      isGrowingBeard: z.boolean().describe("true if yes, false if not"),
    });

    const facialHairCheck: RunType[] = [
      {
        isMini: true,
        content: [
          {
            type: "image_url",
            image_url: {
              url: await urlToBase64(relevantImage.mainUrl.url),
              detail: "low",
            },
          },
        ],
        callback: () =>
          incrementProgress({
            operationKey: "routine",
            value: 1 * incrementMultiplier,
            userId: String(userId),
          }),
        responseFormat: zodResponseFormat(
          FacialHairCheckResponseType,
          "FacialHairCheckResponseType"
        ),
      },
    ];

    const response = await askRepeatedly({
      runs: facialHairCheck,
      userId,
      functionName: "checkFacialHair",
      systemContent:
        "Does it appear like the user is growing beard or moustache?",
      categoryName,
    });

    return response.isGrowingBeard;
  } catch (err) {
    throw httpError(err);
  }
}
