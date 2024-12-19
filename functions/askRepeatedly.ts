import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import {
  AskOpenaiProps,
  MessageType,
  RoleEnum,
  RunType,
} from "types/askOpenaiTypes.js";
import askOpenai from "./askOpenai.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  runs: RunType[];
  meta?: string;
  seed?: number;
  userId: string;
  functionName: string;
  systemContent: string;
  isResultString?: boolean;
};

const defaultSeed = Number(process.env.DEFAULT_OPENAI_SEED);

async function askRepeatedly({
  runs,
  seed,
  userId,
  functionName,
  systemContent,
  isResultString,
}: Props) {
  try {
    if (!ObjectId.isValid(userId))
      throw httpError("Invalid userId format and no meta");

    let result;
    
    let conversation: MessageType[] = [
      { role: "system" as RoleEnum, content: systemContent },
    ];

    for (let i = 0; i < runs.length; i++) {
      conversation.push({
        role: "user",
        content: runs[i].content,
      } as MessageType);

      const payload: AskOpenaiProps = {
        userId,
        functionName,
        seed: seed || defaultSeed,
        messages: conversation,
        isMini: runs[i].isMini,
        isJson: isResultString ? false : i === runs.length - 1,
      };

      if (runs[i].model) payload.model = runs[i].model;
      if (runs[i].responseFormat)
        payload.responseFormat = runs[i].responseFormat;

      result = await doWithRetries(async () => askOpenai(payload));

      conversation.push({
        role: "assistant" as RoleEnum,
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
