import z from "zod";
import { CategoryNameEnum } from "@/types.js";
import askTogether from "./askTogether.js";
import httpError from "@/helpers/httpError.js";
import { zodToJsonSchema } from "zod-to-json-schema";

type Props = {
  userId: string;
  image: string;
  categoryName: CategoryNameEnum;
};

export default async function checkPeopleSimilarity({
  userId,
  image,
  categoryName,
}: Props) {
  try {
    const messages = [
      {
        role: "system",
        content: `On which of the following images the person is same with the person from the image 0? Respond with the indexes indicated with red. If there are no same people, respond with an empty array.`,
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

    const responseSchema = z.object({
      samePersonImageIndexes: z
        .array(z.number())
        .describe("The indexes of the images where the person is same"),
    });

    const responseFormat = zodToJsonSchema(responseSchema, {
      name: "checkPeopleSimilarityResponseSchema",
      nameStrategy: "title",
    });

    const result = await askTogether({
      messages,
      userId,
      categoryName,
      model: "meta-llama/Llama-3_2-11B-Vision-Instruct-Turbo",
      functionName: "checkPeopleSimilarity",
      responseFormat,
    });

    return result.samePersonImageIndexes;
  } catch (err) {
    throw httpError(err);
  }
}
