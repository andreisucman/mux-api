import * as dotenv from "dotenv";
dotenv.config();

import askRepeatedly from "functions/askRepeatedly.js";
import { RunType } from "types/askOpenaiTypes.js";
import { TypeEnum, CategoryNameEnum } from "types.js";
import httpError from "helpers/httpError.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";

type Props = {
  userId: string;
  type: TypeEnum;
  filterOverwhelming?: boolean;
  categoryName: CategoryNameEnum;
  rawNewSchedule: { [key: string]: ScheduleTaskType[] };
  currentSchedule: {
    [key: string]: ScheduleTaskType[];
  };
};

export default async function mergeSchedules({
  type,
  userId,
  categoryName,
  rawNewSchedule,
  currentSchedule,
  filterOverwhelming,
}: Props) {
  try {
    let systemContent = `You are a ${
      type === "head" ? "dermatologist and dentist" : "fitness coach"
    }. The user gives you two task schedules - 1 and 2. Your goal is to {${
      filterOverwhelming ? "add some of the tasks from" : "merge"
    }} schedule 2 into schedule 1 without moving the dates of the schedule 1. Your response is the merged schedule in the original JSON object format.`;

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
    ];

    if (filterOverwhelming) {
      userContent.push(
        {
          isMini: true,
          content: [
            {
              type: "text",
              text: "Which tasks from schedule 2 can safely be transferred into schedule 1 without overwhelming it?",
            },
            {
              type: "text",
              text: "Which tasks from schedule 2 can safely be transferred into schedule 1 without conflicting with the existing tasks of the schedule 1?",
            },
          ],
        },
        {
          isMini: true,
          content: [
            {
              type: "text",
              text: "If there are safe to transfer tasks in the schedule 2, transfer them into schedue 1 without moving the dates of the existing tasks of schedule 1.",
            },
          ],
        }
      );
    } else {
      userContent.push(
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
        }
      );
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
