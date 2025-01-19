import { CategoryNameEnum } from "@/types.js";
import askTogether from "./askTogether.js";
import httpError from "@/helpers/httpError.js";
import { cleanString } from "@/helpers/utils.js";

type Props = {
  userId: string;
  image: string;
  categoryName: CategoryNameEnum;
};

export default async function checkImageVisibility({
  userId,
  image,
  categoryName,
}: Props) {
  try {
    const messages = [
      {
        role: "system",
        content: `Is the human on the image clearly visible with no shadows obscuring their features? Respond with a "yes" if yes, and "no" if no. Say nothing more but yes or no.`,
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: image,
            },
          },
        ],
      },
    ];

    const verdict = await askTogether({
      messages,
      userId,
      categoryName,
      model: "meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo",
      functionName: "checkImageVisibility",
    });

    return cleanString(verdict) === "yes";
  } catch (err) {
    throw httpError(err);
  }
}
