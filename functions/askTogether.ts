import * as dotenv from "dotenv";
dotenv.config();

import doWithRetries from "helpers/doWithRetries.js";
import { together } from "init.js";
import { CategoryNameEnum } from "@/types.js";
import updateSpend from "./updateSpend.js";
import httpError from "@/helpers/httpError.js";
import { ObjectId } from "mongodb";
import generateSeed from "@/helpers/generateSeed.js";
import getCompletionCost from "@/helpers/getCompletionCost.js";

type AskTogetherProps = {
  userId: string;
  seed?: number;
  model: string;
  messages: any[];
  functionName: string;
  categoryName: CategoryNameEnum;
  responseFormat?: any;
};

async function askTogether({
  model,
  seed,
  userId,
  messages,
  functionName,
  categoryName,
  responseFormat,
}: AskTogetherProps) {
  try {
    if (!ObjectId.isValid(userId)) throw httpError("Invalid userId");

    let finalSeed = seed;

    if (!finalSeed) {
      finalSeed = generateSeed(userId);
    }

    const options: { [key: string]: any } = {
      messages,
      model,
      temperature: 0,
    };

    if (responseFormat) {
      options.response_format = { type: "json_object", schema: responseFormat };
    }

    const completion = await doWithRetries(async () =>
      together.chat.completions.create(options as any)
    );

    const inputTokens = completion.usage.prompt_tokens;
    const outputTokens = completion.usage.completion_tokens;

    const { unitCost, units } = getCompletionCost({
      inputTokens,
      modelName: model,
      outputTokens,
      divisor: 1000000,
    });

    const modelKey = model.split(".").join("_");

    updateSpend({
      functionName,
      modelName: modelKey,
      categoryName,
      unitCost,
      units,
      userId,
      userType: "user"
    });

    const content = completion.choices[0].message.content;

    return responseFormat ? JSON.parse(content) : content;
  } catch (err) {
    throw httpError(err);
  }
}

export default askTogether;
