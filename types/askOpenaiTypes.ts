import {
  ChatCompletionMessageParam,
  ChatCompletionContentPart,
} from "openai/src/resources/index.js";
import { CategoryNameEnum } from "@/types.js";

export enum RoleEnum {
  USER = "user",
  ASSISTANT = "assistant",
  SYSTEM = "system",
}

export type RunType = {
  content: ChatCompletionContentPart[];
  model?: string;
  responseFormat?: any;
  callback?: () => void;
};

export type AskOpenaiProps = {
  userId: string;
  seed: number;
  model: string;
  messages: ChatCompletionMessageParam[];
  responseFormat?: any;
  functionName: string;
  categoryName: CategoryNameEnum;
};
