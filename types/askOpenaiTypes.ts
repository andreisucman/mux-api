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
  isMini?: boolean;
  content: ChatCompletionContentPart[];
  model?: string;
  responseFormat?: any;
  callback?: () => void;
};

export type AskOpenaiProps = {
  userId: string;
  seed: number;
  model?: string;
  messages: ChatCompletionMessageParam[];
  responseFormat?: any;
  isMini: boolean;
  isJson: boolean;
  functionName: string;
  categoryName: CategoryNameEnum;
};
