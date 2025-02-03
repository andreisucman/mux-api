import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import { AskOpenaiProps, RunType } from "types/askOpenaiTypes.js";
import { CategoryNameEnum } from "@/types.js";
import askOpenai from "./askOpenai.js";
import generateSeed from "@/helpers/generateSeed.js";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import httpError from "@/helpers/httpError.js";

type Props = {
  runs: RunType[];
  meta?: string;
  seed?: number;
  userId: string;
  categoryName: CategoryNameEnum;
  functionName: string;
  systemContent: string;
  isResultString?: boolean;
};

async function askRepeatedly({
  runs,
  seed,
  userId,
  functionName,
  categoryName,
  systemContent,
  isResultString,
}: Props) {
  try {
    if (!ObjectId.isValid(userId))
      throw httpError("Invalid userId format and no meta");

    let finalSeed = seed;
    let result: string;

    if (!finalSeed) {
      finalSeed = generateSeed(userId);
    }

    let conversation: ChatCompletionMessageParam[] = [
      { role: "system", content: systemContent },
    ];

    for (let i = 0; i < runs.length; i++) {
      conversation.push({
        role: "user",
        content: runs[i].content,
      });

      const payload: AskOpenaiProps = {
        userId,
        functionName,
        categoryName,
        seed,
        messages: conversation,
        isMini: runs[i].isMini,
        isJson: isResultString ? false : i === runs.length - 1,
      };

      if (runs[i].model) payload.model = runs[i].model;
      if (runs[i].responseFormat)
        payload.responseFormat = runs[i].responseFormat;

      result = await doWithRetries(async () => askOpenai(payload));

      conversation.push({
        role: "assistant",
        content: [
          {
            type: "text",
            text: result,
          },
        ],
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
