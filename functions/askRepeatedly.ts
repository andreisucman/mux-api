import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import askOpenai from "functions/askOpenAi.js";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";
import {
  AskOpenaiProps,
  MessageType,
  RoleEnum,
  RunType,
} from "types/askOpenaiTypes.js";

type Props = {
  runs: RunType[];
  meta?: string;
  seed?: number;
  userId: string;
  systemContent: string;
  isResultString?: boolean;
  responseFormat?: any;
};

const defaultSeed = Number(process.env.DEFAULT_OPENAI_SEED);

async function askRepeatedly({
  runs,
  meta,
  seed,
  userId,
  systemContent,
  isResultString,
  responseFormat,
}: Props) {
  try {
    if (!ObjectId.isValid(userId) && !meta)
      throw new Error("Invalid userId format and no meta");

    let result;
    let conversation: MessageType[] = [
      { role: "system" as RoleEnum, content: systemContent },
    ];

    for (let i = 0; i < runs.length; i++) {
      conversation.push({
        role: "user",
        content: runs[i].content,
      } as MessageType);

      const finalResponseFormat = runs[i].responseFormat
        ? runs[i].responseFormat
        : responseFormat;

      const payload: AskOpenaiProps = {
        userId,
        meta,
        seed: seed || defaultSeed,
        messages: conversation,
        isMini: runs[i].isMini,
        isJson: isResultString ? false : i === runs.length - 1,
      };

      if (runs[i].model) payload.model = runs[i].model;
      if (finalResponseFormat) payload.responseFormat = finalResponseFormat;

      const response = await doWithRetries({
        functionName: "askRepeatedly - askOpenai",
        functionToExecute: async () => askOpenai(payload),
      });

      result = response.result;

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
  } catch (error) {
    addErrorLog({ functionName: "askRepeatedly", message: error.message });
    throw error;
  }
}

export default askRepeatedly;
