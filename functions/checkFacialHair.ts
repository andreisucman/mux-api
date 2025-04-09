import httpError from "@/helpers/httpError.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import { urlToBase64 } from "@/helpers/utils.js";
import { CategoryNameEnum, ProgressImageType } from "@/types.js";
import askRepeatedly from "./askRepeatedly.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { z } from "zod";
import createImageCollage from "./createImageCollage.js";

type Props = {
  userId: string;
  partImages: ProgressImageType[];
  incrementMultiplier?: number;
  categoryName: CategoryNameEnum;
};

export default async function checkFacialHair({ userId, categoryName, partImages, incrementMultiplier = 1 }: Props) {
  try {
    const imageCollage = await createImageCollage({
      images: partImages.map((imo) => imo.mainUrl.url),
      isGrid: true,
    });

    const FacialHairCheckResponseType = z.object({
      isGrowingBeard: z.boolean().describe("true if yes, false if not"),
    });

    const facialHairCheck: RunType[] = [
      {
        model: "gpt-4o-mini",
        content: [
          {
            type: "image_url",
            image_url: {
              url: await urlToBase64(imageCollage),
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
        responseFormat: zodResponseFormat(FacialHairCheckResponseType, "FacialHairCheckResponseType"),
      },
    ];

    const response = await askRepeatedly({
      runs: facialHairCheck,
      userId,
      functionName: "checkFacialHair",
      systemContent: "Does it appear like the user is growing beard or moustache?",
      categoryName,
    });

    return response.isGrowingBeard;
  } catch (err) {
    throw httpError(err);
  }
}
