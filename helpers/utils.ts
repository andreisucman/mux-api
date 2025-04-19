import mime from "mime-types";
import { DateTime } from "luxon";
import bcrypt from "bcrypt";
import setToMidnight from "./setToMidnight.js";
import { ScoreType } from "@/types.js";

export function delayExecution(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getExponentialBackoffDelay(attempt: number, baseDelay = 3000, maxDelay = 15000) {
  const rawDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelay - baseDelay / 2;
  return Math.min(rawDelay + jitter, maxDelay);
}

export type DaysFromProps = {
  date?: Date;
  days: number;
};

export function daysFrom({ date = new Date(), days }: DaysFromProps) {
  return new Date(new Date(date).getTime() + days * 24 * 60 * 60 * 1000);
}

export const getMimeType = (filePath: string) => {
  return mime.lookup(filePath) || "application/octet-stream";
};

export function toSnakeCase(value: any): string {
  if (typeof value !== "string") {
    return value;
  }

  const words = value.trim().split(/[\s-_]+/);
  return words.map((word) => word.toLowerCase()).join("_");
}

export function toSentenceCase(value: any): string {
  if (typeof value !== "string") return value;

  return value.trim().replace(/^\w/, (char) => char.toUpperCase());
}

export function sortObjectByNumberValue(obj: { [key: string]: number }, isAscending: boolean) {
  return Object.fromEntries(
    isAscending ? Object.entries(obj).sort(([, a], [, b]) => a - b) : Object.entries(obj).sort(([, a], [, b]) => b - a)
  );
}

export const getHashedPassword = async (password?: string): Promise<string | null> => {
  return password ? await bcrypt.hash(password, 10) : null;
};

export function minutesFromNow(minutes: number) {
  return new Date(Math.round(new Date().getTime() + minutes * 60000));
}

export function calculateDaysDifference(dateFrom: Date, dateTo: Date) {
  try {
    const from = new Date(dateFrom).getTime();
    const to = new Date(dateTo).getTime();
    const differenceInTime = to - from;
    const differenceInDays = differenceInTime / (1000 * 3600 * 24);
    return Math.round(differenceInDays);
  } catch (err) {
    console.log(`Error in calculateDaysDifference:`, err.message);
    throw err;
  }
}

export function arrayElementExistsWithinArray(arrayOne: string[], arrayTwo: string[]) {
  return arrayOne.some((record) => arrayTwo.includes(record));
}

export function convertKeysAndValuesTotoSnakeCase(obj: { [key: string]: any }) {
  const newObj: { [key: string]: any } = {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      let lowerCaseKey = key.toLowerCase();
      let toSnakeCaseValues;

      if (Array.isArray(obj[key])) {
        toSnakeCaseValues = obj[key].map(
          ({ solution, monthlyFrequency }: { solution: string; monthlyFrequency: number }) => ({
            solution: toSnakeCase(solution),
            monthlyFrequency,
            concern: key,
          })
        );
      } else {
        toSnakeCaseValues = obj[key];
      }

      newObj[lowerCaseKey] = toSnakeCaseValues;
    }
  }

  return newObj;
}

export function normalizeString(string: string) {
  if (!string) return "";
  const normalized = string
    .split(/[\s_]+/)
    .join(" ")
    .toLowerCase();
  return normalized[0].toUpperCase() + normalized.slice(1);
}

export function combineSolutions(
  findSolutionsResponse: { [key: string]: string },
  findAdditionalSolutionsResponse: { [key: string]: string[] }
) {
  const combinedSolutions: { [key: string]: string[] } = {};

  for (const [concern, solution] of Object.entries(findSolutionsResponse)) {
    combinedSolutions[concern] = [solution, ...(findAdditionalSolutionsResponse[solution] || [])];
  }

  return combinedSolutions;
}

export default function selectItemsAtEqualDistances(arr: any[], numberOfImages: number) {
  if (arr.length <= numberOfImages) {
    return arr;
  }

  const selectedItems = [];

  const distance = (arr.length - 1) / (numberOfImages - 1);

  for (let i = 0; i < numberOfImages; i++) {
    selectedItems.push(arr[Math.round(i * distance)]);
  }

  return selectedItems;
}

export function getTimezoneOffset(timeZone: string) {
  const dt = DateTime.now().setZone(timeZone);
  return dt.offset;
}

export function cleanString(str: string) {
  return str
    .replace(/[^a-zA-Z]/g, "")
    .trim()
    .toLowerCase();
}

export function keepNumbersAndCommas(str: string) {
  return str.replace(/[^0-9,]/g, "");
}

export async function urlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type");
  return `data:${contentType};base64,${Buffer.from(buffer).toString("base64")}`;
}

export function setToUtcMidnight(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function checkDateValidity(date: Date | string, timeZone: string) {
  const dateObj = typeof date === "string" ? DateTime.fromISO(date, { zone: timeZone }).toJSDate() : date;

  const isValidDate = !isNaN(dateObj.getTime());

  if (!isValidDate) {
    return { isValidDate: false, isFutureDate: false };
  }

  const nowUtcMidnight = setToMidnight({ date: new Date(), timeZone });
  const dateUtcMidnight = setToMidnight({ date: dateObj, timeZone });
  const isFutureDate = dateUtcMidnight >= nowUtcMidnight;

  return { isValidDate, isFutureDate };
}

export function calculateScoreDifferences(initialScores: ScoreType[], currentScores: ScoreType[]) {
  return initialScores
    .map((obj) => {
      const relevantNewScoreObject = currentScores.find((newObj) => newObj.name === obj.name);

      if (relevantNewScoreObject) {
        return { name: obj.name, value: relevantNewScoreObject.value - obj.value, part: obj.part };
      }
      return null;
    })
    .filter(Boolean);
}
