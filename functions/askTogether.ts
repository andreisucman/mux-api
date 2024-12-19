import * as dotenv from "dotenv";
dotenv.config();

import doWithRetries from "helpers/doWithRetries.js";
import { RoleEnum } from "@/types/askOpenaiTypes.js";
import { together } from "init.js";
import updateSpend from "./updateSpend.js";
import httpError from "@/helpers/httpError.js";

type AskTogetherProps = {
  userId: string;
  seed?: number;
  model: string;
  messages: { role: RoleEnum; content: string }[];
  isJson?: boolean;
  functionName: string;
};

const { LLAMA_2_11B_VISION_PRICE } = process.env;

const priceMap: { [key: string]: number } = {
  "meta-llama/Llama-3_2-11B-Vision-Instruct-Turbo": Number(
    LLAMA_2_11B_VISION_PRICE
  ),
};

async function askTogether({
  messages,
  model,
  functionName,
  userId,
}: AskTogetherProps) {
  try {
    if (!model) throw httpError("Model is missing");

    const options: { [key: string]: any } = {
      messages,
      model,
      temperature: 0,
    };

    const completion = await doWithRetries(async () =>
      together.chat.completions.create(options as any)
    );

    const inputTokens = completion.usage.prompt_tokens;
    const outputTokens = completion.usage.completion_tokens;

    const modelKey = model.split(".").join("_");
    const unitCost = priceMap[modelKey] / 1000000;

    updateSpend({
      functionName,
      modelName: modelKey,
      unitCost,
      units: inputTokens + outputTokens,
      userId,
    });

    return completion.choices[0].message.content;
  } catch (err) {
    throw httpError(err);
  }
}

export default askTogether;
