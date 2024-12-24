export enum RoleEnum {
  USER = "user",
  ASSISTANT = "assistant",
  SYSTEM = "system",
}

export type ContentType = {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string; detail: "high" | "low" } | null;
};

export type MessageType = {
  role: RoleEnum;
  content: ContentType[] | string;
};

export type RunType = {
  isMini: boolean;
  content: ContentType[];
  model?: string;
  responseFormat?: any;
  callback?: () => void;
};

export type AskOpenaiProps = {
  userId: string;
  seed: number;
  model?: string;
  messages: MessageType[];
  responseFormat?: any;
  isMini: boolean;
  isJson: boolean;
  functionName: string;
  categoryName: string;
};
