import mime from "mime-types";

export function delayExecution(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getExponentialBackoffDelay(
  attempt: number,
  baseDelay = 1000,
  maxDelay = 12000
) {
  const rawDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelay - baseDelay / 2;
  return Math.min(rawDelay + jitter, maxDelay);
}

type DaysFromProps = {
  date?: Date;
  days: number;
};

export function daysFrom({ date = new Date(), days }: DaysFromProps) {
  return new Date(new Date(date).getTime() + days * 24 * 60 * 60 * 1000);
}

export const getMimeType = (filePath: string) => {
  return mime.lookup(filePath) || "application/octet-stream";
};

export function upperFirst(string: string) {
  if (!string) return "";

  return string[0].toUpperCase() + string.slice(1);
}

export function toSnakeCase(string: string) {
  if (!string) return "";
  const words = string.trim().split(/[\s-_]+/);
  return words.map((word) => word.toLowerCase()).join("_");
}
