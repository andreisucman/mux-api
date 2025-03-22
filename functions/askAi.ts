import * as dotenv from "dotenv";
dotenv.config();

import { deepSeek, openai, together } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import { AskOpenaiProps } from "types/askOpenaiTypes.js";
import httpError from "@/helpers/httpError.js";
import updateSpend from "./updateSpend.js";
import { ChatCompletionCreateParams } from "openai/resources/index.mjs";
import getCompletionCost from "@/helpers/getCompletionCost.js";
import { ChatCompletion } from "openai/src/resources/index.js";

const openAiModels = ["gpt", "o3", "ft:"];
const llamaModels = ["meta-llama"];
const deepseekModels = ["deepseek"];

async function askAi({
  messages,
  seed,
  model,
  functionName,
  categoryName,
  userId,
  responseFormat,
}: AskOpenaiProps) {
  try {
    const isOpenaiModel = openAiModels.some((name) => model.startsWith(name));
    const isLlamaModel = llamaModels.some((name) => model.startsWith(name));
    const isDeepseekModel = deepseekModels.some((name) =>
      model.startsWith(name)
    );

    let client: any = openai;
    if (isLlamaModel) client = together;
    if (isDeepseekModel) client = deepSeek;

    const options: ChatCompletionCreateParams = {
      messages,
      seed,
      model,
    };

    if (isOpenaiModel) {
      if (!model.startsWith("o3")) options.temperature = 0;
      if (responseFormat) options.response_format = responseFormat;
    }

    const completion: ChatCompletion = await doWithRetries(async () =>
      client.chat.completions.create(options)
    );

    const inputTokens = completion.usage.prompt_tokens;
    const outputTokens = completion.usage.completion_tokens;

    const { unitCost, units } = getCompletionCost({
      inputTokens,
      outputTokens,
      modelName: model,
      divisor: 1000000,
    });

    updateSpend({
      functionName,
      modelName: model,
      categoryName,
      unitCost,
      units,
      userId,
    });

    return responseFormat
      ? JSON.parse(completion.choices[0].message.content)
      : completion.choices[0].message.content;
  } catch (err) {
    throw httpError(err);
  }
}

export default askAi;
