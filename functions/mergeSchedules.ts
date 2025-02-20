import * as dotenv from "dotenv";
dotenv.config();

import askRepeatedly from "functions/askRepeatedly.js";
import { RunType } from "types/askOpenaiTypes.js";
import { CategoryNameEnum } from "types.js";
import httpError from "helpers/httpError.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";

type Props = {
  userId: string;
  categoryName: CategoryNameEnum;
  specialConsiderations: string;
  rawNewSchedule: { [key: string]: ScheduleTaskType[] };
  currentSchedule: {
    [key: string]: ScheduleTaskType[];
  };
};

export default async function mergeSchedules({
  userId,
  categoryName,
  specialConsiderations,
  rawNewSchedule,
  currentSchedule,
}: Props) {
  try {
    let systemContent = `You are a dermatologist, dentist and a fitness coach. The user gives you two schedules - 1 and 2. Your goal is to merge schedule 2 into schedule 1 without moving the dates of the schedule 1. Your response is the merged schedule in the original JSON object format.`;

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
            text: "Can you confirm that the dates of the original tasks in schedule 1 haven't changed? They must not change.",
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
    ];

    if (specialConsiderations) {
      // this check is needed to ensure that last weeks tasks don't contradict the new special consideration
      userContent.push({
        isMini: true,
        content: [
          {
            type: "text",
            text: `The user has this special consideration: ${specialConsiderations}. Are there any tasks in the schedule that are clearly contraindicated based on the user's special consideration? If yes, remove them from the schedule, if not, leave as is.`,
          },
        ],
      });
    }

    userContent.push(
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
            text: `Return the latest updated schedule in the original JSON format.`,
          },
        ],
      }
    );

    const mergedSchedule: { [key: string]: ScheduleTaskType[] } =
      await askRepeatedly({
        userId,
        categoryName,
        systemContent,
        runs: userContent,
        functionName: "mergeSchedules",
      });
    return mergedSchedule;
  } catch (error) {
    throw httpError(error);
  }
}
