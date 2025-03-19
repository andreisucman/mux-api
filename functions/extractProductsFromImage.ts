import httpError from "helpers/httpError.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { urlToBase64 } from "@/helpers/utils.js";
import askRepeatedly from "./askRepeatedly.js";
import { CategoryNameEnum } from "@/types.js";

type Props = {
  imageUrl: string;
  userId: string;
};

export default async function extractProductsFromImage({
  userId,
  imageUrl,
}: Props) {
  try {
    let systemContent = `Extract all of the product from the image. Your response is a comma-separated string of products present on the image. If no products are present on the image return an empty string. \n.`;

    const runs: RunType[] = [
      {
        model: "gpt-4o-mini",
        content: [
          {
            type: "image_url" as "image_url",
            image_url: {
              url: await urlToBase64(imageUrl),
              detail: "low",
            },
          },
        ],
      },
    ];

    const response = await askRepeatedly({
      userId,
      runs,
      systemContent,
      categoryName: CategoryNameEnum.TASKS,
      functionName: "extractProductsFromImage",
    });

    return response;
  } catch (err) {
    throw httpError(err);
  }
}
