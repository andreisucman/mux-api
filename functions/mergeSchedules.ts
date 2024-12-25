import * as dotenv from "dotenv";
dotenv.config();

import askRepeatedly from "functions/askRepeatedly.js";
import { RunType } from "types/askOpenaiTypes.js";
import { TypeEnum, CategoryNameEnum } from "types.js";
import httpError from "helpers/httpError.js";

type Props = {
  userId: string;
  type: TypeEnum;
  categoryName: CategoryNameEnum;
  rawNewSchedule: { [key: string]: { key: string; concern: string }[] };
  currentSchedule: {
    [key: string]: { key: string; concern: string }[];
  };
};

export default async function mergeSchedules({
  type,
  userId,
  categoryName,
  rawNewSchedule,
  currentSchedule,
}: Props) {
  try {
    const systemContent = `You are a ${
      type === "head" ? "dermatologist and dentist" : "fitness coach"
    }. The user gives you two schedules - 1 and 2. Your goal is to merge schedule 2 into schedule one without moving the dates of the schedule 1. Your response is the merged schedule in the original Json object format.`;

    const userContent: RunType[] = [
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Schedule 1: ${JSON.stringify(currentSchedule)}.`,
          },
          {
            type: "text",
            text: `Schedule 2: ${JSON.stringify(rawNewSchedule)}.`,
          },
        ],
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: "Can you confirm that the dates of the schedule 1 haven't changed? They must not change.",
          },
        ],
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: "Can you confirm that you've transferred all of the tasks from the schedule 2 into the schedule 1?",
          },
        ],
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: "Can you confirm that the newly added tasks are ordered optimally? If not, reorder them for maximum efficiency.",
          },
        ],
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Return the latest updated schedule as JSON.`,
          },
        ],
      },
    ];

    return await askRepeatedly({
      userId,
      categoryName,
      systemContent,
      runs: userContent,
      functionName: "mergeSchedules",
    });
  } catch (error) {
    throw httpError(error);
  }
}
