import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import doWithRetries from "@/helpers/doWithRetries.js";
import { AskOpenaiProps, RunType } from "types/askOpenaiTypes.js";
import { CategoryNameEnum } from "@/types.js";
import askAi from "@/functions/askAi.js";
import generateSeed from "@/helpers/generateSeed.js";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import httpError from "@/helpers/httpError.js";

type Props = {
  runs: RunType[];
  seed?: number;
  userId: string;
  categoryName: CategoryNameEnum;
  functionName: string;
  systemContent: string;
};

async function askRepeatedly({ runs, seed, userId, functionName, categoryName, systemContent }: Props) {
  try {
    if (!ObjectId.isValid(userId)) throw httpError("Invalid userId format and no meta");

    let finalSeed = seed;
    let result;

    if (!finalSeed) {
      finalSeed = generateSeed(userId);
    }

    let conversation: ChatCompletionMessageParam[] = [{ role: "system", content: systemContent }];

    for (let i = 0; i < runs.length; i++) {
      conversation.push({
        role: "user",
        content: runs[i].content,
      });

      const payload: AskOpenaiProps = {
        userId,
        seed: finalSeed,
        functionName,
        categoryName,
        messages: conversation,
        model: runs[i].model,
      };

      if (runs[i].model) payload.model = runs[i].model;
      if (runs[i].responseFormat) payload.responseFormat = runs[i].responseFormat;

      result = await doWithRetries(async () => askAi(payload));

      conversation.push({
        role: "assistant",
        content: result,
      });

      if (runs[i].callback) {
        runs[i].callback();
      }
    }

    return result;
  } catch (err) {
    throw httpError(err);
  }
}

export default askRepeatedly;
