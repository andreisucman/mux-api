import * as dotenv from "dotenv";
dotenv.config();

import askRepeatedly from "functions/askRepeatedly.js";
import { RunType } from "types/askOpenaiTypes.js";
import { CategoryNameEnum, PartEnum } from "types.js";
import httpError from "helpers/httpError.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";

type Props = {
  userId: string;
  part: PartEnum;
  incrementMultiplier?: number;
  categoryName: CategoryNameEnum;
  specialConsiderations: string;
  rawNewSchedule: { [key: string]: ScheduleTaskType[] };
  currentSchedule: {
    [key: string]: ScheduleTaskType[];
  };
  latestCompletedTasks?: {
    [key: string]: ScheduleTaskType[];
  };
};

export default async function mergeSchedules({
  userId,
  part,
  categoryName,
  incrementMultiplier = 1,
  specialConsiderations,
  rawNewSchedule,
  currentSchedule,
  latestCompletedTasks,
}: Props) {
  try {
    let systemContent = `You are a dermatologist, dentist and a fitness coach. The user gives you two schedules - 1 and 2. Your goal is to merge schedule 2 optimally into schedule 1 without moving the dates of the schedule 1. Your response is the merged schedule in the original JSON object format.`;
    const callback = () =>
      incrementProgress({
        operationKey: "routine",
        userId,
        value: 1 * incrementMultiplier,
      });

    const userContent: RunType[] = [
      {
        model: "o3-mini",
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
        callback,
      },
      {
        model: "gpt-4o-mini",
        content: [
          {
            type: "text",
            text: "Can you confirm that the dates of the original tasks in schedule 1 haven't changed? They must not change.",
          },
        ],
        callback,
      },
    ];

    if (part === "body") {
      userContent.push({
        model: "o3-mini",
        content: [
          {
            type: "text",
            text: "Reschedule the exercises from schedule 2 into a push-pull-legs split, ensuring pushing exercises are grouped in the same dates, and similarly for the pulling and leg exercises. Remember NOT to move the exercises from schedule 1.",
          },
        ],
        callback,
      });
    }

    if (latestCompletedTasks) {
      userContent.push({
        model: "o3-mini",
        content: [
          {
            type: "text",
            text: `Here are the solutions I've completed within the last 2 weeks. Does any of them require resting time that extends to the current routine, conflicting with any of this week's tasks? If yes remove the conflicting 2nd schedule solutions from the final schedule.`,
          },
          {
            type: "text",
            text: `Solutions completed within the last 2 weeks: ${JSON.stringify(
              latestCompletedTasks
            )}`,
          },
        ],
        callback,
      });
    }

    if (specialConsiderations) {
      // this check is needed to ensure that last weeks tasks don't contradict the new special consideration
      userContent.push({
        model: "gpt-4o-mini",
        content: [
          {
            type: "text",
            text: `The user has this special consideration: ${specialConsiderations}. Are there any tasks in the schedule that are clearly contraindicated based on the user's special consideration? If yes, remove them from the schedule, if not, leave as is.`,
          },
        ],
      });
    }

    userContent.push({
      model: "gpt-4o-mini",
      responseFormat: { type: "json_object" },
      content: [
        {
          type: "text",
          text: `Return the latest updated schedule in the original JSON format.`,
        },
      ],
      callback,
    });

    const mergedSchedule = await askRepeatedly({
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
