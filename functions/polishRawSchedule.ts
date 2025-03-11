import * as dotenv from "dotenv";
dotenv.config();

import askRepeatedly from "functions/askRepeatedly.js";
import incrementProgress from "helpers/incrementProgress.js";
import { UserConcernType, CategoryNameEnum, PartEnum } from "types.js";
import { RunType } from "types/askOpenaiTypes.js";
import httpError from "helpers/httpError.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";

type Props = {
  rawSchedule: { [key: string]: ScheduleTaskType[] };
  concerns: UserConcernType[];
  userId: string;
  part: PartEnum;
  categoryName: CategoryNameEnum;
  specialConsiderations: string;
  incrementMultiplier?: number;
};

export default async function polishRawSchedule({
  rawSchedule,
  concerns,
  userId,
  part,
  categoryName,
  incrementMultiplier = 1,
  specialConsiderations,
}: Props) {
  try {
    const callback = () =>
      incrementProgress({
        operationKey: "routine",
        value: 1 * incrementMultiplier,
        userId,
      });

    const listOfConcerns = JSON.stringify(concerns);

    const systemContent =
      "You are a dermatologist, dentist, and a fitness coach. The user gives you their improvement routine. Your goal is to optimize the order of the tasks for their maximum safety and effectiveness. DON'T REMOVE OR MODIFY THE NAMES OF THE TASKS. MAINTAIN THE SCHEMA FORMAT OF THE SCHEDULE. Be concise and to the point.";

    const userContent: RunType[] = [
      {
        model: "o3-mini",
        content: [
          {
            type: "text",
            text: `This is my schedule: ${JSON.stringify(rawSchedule)}.`,
          },
          {
            type: "text",
            text: `It's designed to target the following concerns: ${listOfConcerns}.`,
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
            text: "Reschedule the exercises into a push-pull-legs split, ensuring pushing exercises are on one day, pulling exercises on another, and leg exercises on a separate day.",
          },
        ],
        callback,
      });
    }

    if (specialConsiderations) {
      userContent.push({
        model: "o3-mini",
        content: [
          {
            type: "text",
            text: `The user has the following special consideration: ${specialConsiderations}. Does the schedule to be changed to account for it? If yes, change it, if not leave as is.`,
          },
        ],
        callback,
      });
    }

    userContent.push({
      model: "gpt-4o-mini",
      content: [
        {
          type: "text",
          text: `Have you modified the names of the tasks? The names of the tasks must not change.`,
        },
      ],
      callback,
    });

    userContent.push({
      model: "gpt-4o-mini",
      responseFormat: { type: "json_object" },
      content: [
        {
          type: "text",
          text: `Return the latest updated schedule as JSON in the original format.`,
        },
      ],
      callback,
    });

    const polishedSchedule: { [key: string]: ScheduleTaskType[] } =
      await askRepeatedly({
        userId,
        categoryName,
        systemContent,
        runs: userContent,
        functionName: "polishRawSchedule",
      });

    return polishedSchedule;
  } catch (error) {
    throw httpError(error);
  }
}
