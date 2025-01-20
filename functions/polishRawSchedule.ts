import * as dotenv from "dotenv";
dotenv.config();

import askRepeatedly from "functions/askRepeatedly.js";
import incrementProgress from "helpers/incrementProgress.js";
import { UserConcernType, TypeEnum, CategoryNameEnum } from "types.js";
import { RunType } from "types/askOpenaiTypes.js";
import httpError from "helpers/httpError.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";

type Props = {
  rawSchedule: { [key: string]: ScheduleTaskType[] };
  concerns: UserConcernType[];
  userId: string;
  type: TypeEnum;
  categoryName: CategoryNameEnum;
  specialConsiderations: string;
};

export default async function polishRawSchedule({
  rawSchedule,
  concerns,
  userId,
  type,
  categoryName,
  specialConsiderations,
}: Props) {
  try {
    const callback = () =>
      incrementProgress({ operationKey: type, increment: 1, userId });

    const systemContent = `You are a ${
      type === "head" ? "dermatologist and dentist" : "fitness coach"
    }. The user gives you their ${
      type === "head" ? "skincare routine" : "workout routine"
    } schedule. Your goal is to optimize the dates of the tasks in the schedule for the maximum effectiveness of the improvement of these concerns: ${JSON.stringify(
      concerns
    )}. YOU CAN MOVE THE EXISTING TASKS IN THE SCHEDULE. MAINTAIN THE SCHEMA OF THE SCHEDULE. Be concise and to the point. Think step-by-step`;

    const userContent: RunType[] = [
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `This is my schedule: ${JSON.stringify(rawSchedule)}.`,
          },
        ],
        callback,
      },
    ];

    if (type === "head") {
      userContent.push({
        isMini: true,
        content: [
          {
            type: "text",
            text: `Are there any tasks that complement or conflict with each other? If yes, move them to different dates as needed for maximum effectiveness and safety.`,
          },
        ],
        callback,
      });
    }

    if (type === "body") {
      userContent.push({
        isMini: true,
        content: [
          {
            type: "text",
            text: `Arrange the exercises according to the push-pull-legs model for the maximum effectiveness. You can move them across the schedule as needed.`,
          },
        ],
        callback,
      });
    }

    userContent.push({
      isMini: false,
      content: [
        {
          type: "text",
          text: `Should any of the tasks be moved to different dates for a more efficient and safe experience? If yes, move them, if not, leave as is.`,
        },
      ],
      callback,
    });

    if (specialConsiderations) {
      userContent.push({
        isMini: true,
        content: [
          {
            type: "text",
            text: `Does the schedule respect the following special consideration? Special consideration: ${specialConsiderations}. If not, edit the schedule to account for it.`,
          },
        ],
        callback,
      });
    }
    userContent.push({
      isMini: true,
      content: [
        {
          type: "text",
          text: `Return the latest updated schedule as JSON.`,
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
