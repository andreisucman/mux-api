import * as dotenv from "dotenv";
dotenv.config();

import { openai } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import { AskOpenaiProps } from "types/askOpenaiTypes.js";
import httpError from "@/helpers/httpError.js";
import updateSpend from "./updateSpend.js";
import { ChatCompletionCreateParams } from "openai/resources/index.mjs";
import getCompletionCost from "@/helpers/getCompletionCost.js";

async function askOpenai({
  messages,
  seed,
  model,
  functionName,
  categoryName,
  userId,
  isMini,
  responseFormat,
  isJson = true,
}: AskOpenaiProps) {
  const finalModel = model
    ? model
    : isMini
    ? process.env.GPT_4O_MINI
    : process.env.GPT_4O;

  try {
    const options: ChatCompletionCreateParams = {
      messages,
      seed,
      model: finalModel,
      temperature: 0,
    };

    if (isJson) options.response_format = { type: "json_object" };
    if (responseFormat) options.response_format = responseFormat;

    const completion = await doWithRetries(async () =>
      openai.chat.completions.create(options)
    );

    const inputTokens = completion.usage.prompt_tokens;
    const outputTokens = completion.usage.completion_tokens;

    const { unitCost, units } = getCompletionCost({
      inputTokens,
      outputTokens,
      modelName: finalModel,
      divisor: 1000000,
    });

    updateSpend({
      functionName,
      modelName: finalModel,
      categoryName,
      unitCost,
      units,
      userId,
    });

    return isJson
      ? JSON.parse(completion.choices[0].message.content)
      : completion.choices[0].message.content;
  } catch (err) {
    throw httpError(err);
  }
}

export default askOpenai;
