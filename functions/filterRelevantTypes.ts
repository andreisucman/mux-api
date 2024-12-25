import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { RunType } from "@/types/askOpenaiTypes.js";
import askRepeatedly from "functions/askRepeatedly.js";
import httpError from "@/helpers/httpError.js";
import { CategoryNameEnum } from "@/types.js";

type Props = {
  userId: string;
  info: string;
  categoryName: CategoryNameEnum;
  productTypes: string[];
};

export default async function filterRelevantProductTypes({
  userId,
  info,
  categoryName,
  productTypes,
}: Props) {
  try {
    const systemContent = `The user gives you a description of the task and a list of product types. Your goal is to select the product types that are strictly relevant to the task. A strictly relevant product type is the one generally used for completing the task. You only select from the list provided, or return an empty array if no relevant product types found. Don't create new product types.`;

    const ResponseProductsType = z.object({
      relevantProductTypes: z.array(z.string()),
    });

    const runs = [
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Description of the task: ${info}<-->Product types: ${JSON.stringify(
              productTypes
            )}`,
          },
        ],
        model:
          "ft:gpt-4o-mini-2024-07-18:personal:save-task-from-description:AHwWkCo2",
        responseFormat: zodResponseFormat(
          ResponseProductsType,
          "ResponseProductsType"
        ),
      },
    ];

    const response = await askRepeatedly({
      systemContent: systemContent,
      runs: runs as RunType[],
      userId,
      categoryName,
      functionName: "filterRelevantProductTypes",
    });

    return response.relevantProductTypes;
  } catch (err) {
    throw httpError(err);
  }
}
