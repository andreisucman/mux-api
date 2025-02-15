import * as dotenv from "dotenv";
dotenv.config();

const {
  TUNED_MODELS,

  O3_MINI,
  O3_MINI_INPUT_PRICE,
  O3_MINI_OUTPUT_PRICE,

  GPT_4O,
  GPT_4O_INPUT_PRICE,
  GPT_4O_OUTPUT_PRICE,

  GPT_4O_MINI,
  GPT_4O_MINI_INPUT_PRICE,
  GPT_4O_MINI_OUTPUT_PRICE,

  GPT_4O_MINI_TUNED,
  GPT_4O_MINI_TUNED_INPUT_PRICE,
  GPT_4O_MINI_TUNED_OUTPUT_PRICE,

  LLAMA_8B,
  LLAMA_11B_VISION,
  LLAMA_8B_PRICE,
  LLAMA_11B_VISION_PRICE,
} = process.env;

const priceMap: { [key: string]: { input: number; output: number } } = {
  [LLAMA_8B]: { input: Number(LLAMA_8B_PRICE), output: Number(LLAMA_8B_PRICE) },
  [LLAMA_11B_VISION]: {
    input: Number(LLAMA_11B_VISION_PRICE),
    output: Number(LLAMA_11B_VISION_PRICE),
  },
  [GPT_4O]: {
    input: Number(GPT_4O_INPUT_PRICE),
    output: Number(GPT_4O_OUTPUT_PRICE),
  },
  [GPT_4O_MINI]: {
    input: Number(GPT_4O_MINI_INPUT_PRICE),
    output: Number(GPT_4O_MINI_OUTPUT_PRICE),
  },
  [GPT_4O_MINI_TUNED]: {
    input: Number(GPT_4O_MINI_TUNED_INPUT_PRICE),
    output: Number(GPT_4O_MINI_TUNED_OUTPUT_PRICE),
  },
  [O3_MINI]: {
    input: Number(O3_MINI_INPUT_PRICE),
    output: Number(O3_MINI_OUTPUT_PRICE),
  },
};

type GetCompletionCostProps = {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  divisor?: number;
};

export default function getCompletionCost({
  divisor = 1000000,
  modelName,
  inputTokens,
  outputTokens,
}: GetCompletionCostProps) {
  const isTuned = TUNED_MODELS.split(",").includes(modelName);

  const price =
    priceMap[modelName] || isTuned ? priceMap[GPT_4O_MINI_TUNED] : undefined;

  const units = inputTokens + outputTokens;
  const inputShare = inputTokens / (inputTokens + outputTokens);
  const weightedUnitCost =
    (inputShare * price.input + (1 - inputShare) * price.output) / divisor;

  return { units, unitCost: weightedUnitCost, cost: weightedUnitCost * units };
}
