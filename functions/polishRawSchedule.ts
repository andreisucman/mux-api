import * as dotenv from "dotenv";
dotenv.config();

import askRepeatedly from "functions/askRepeatedly.js";
import incrementProgress from "helpers/incrementProgress.js";
import { UserConcernType, TypeEnum, CategoryNameEnum } from "types.js";
import { RunType } from "types/askOpenaiTypes.js";
import httpError from "helpers/httpError.js";

type Props = {
  rawSchedule: { [key: string]: { name: string; concern: string[] } };
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
    } schedule. Your goal is edit the schedule for maximum effectiveness in improving these concerns: ${JSON.stringify(
      concerns
    )}. ${
      specialConsiderations
        ? "Consider the following special requirement of the user when eiting the schedule" +
          specialConsiderations
        : ""
    }. YOU CAN DELETE OR MOVE THE EXISTING TASKS IN THE SCHEDULE, BUT NOT ADD NEW ONES. MAINTAIN THE SCHEMA OF THE SCHEDULE. Be concise and to the point. Think step-by-step`;

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
            text: `Are there tasks that complement each other or conflict with each other? If yes, reschedule them for maximum effectiveness and safety.`,
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
            text: `Arrange the exercises according to the push-pull-legs model for maximum effectiveness. You can move them across the schedule as needed.`,
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
          text: `For each day, reorder the tasks according to their best sequence of application. Be concise and to the point.`,
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
            text: `Does the schedule respect the following special consideration? Special consideration: ${specialConsiderations}. If not, change the schedule to confirm it.`,
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

    return await askRepeatedly({
      userId,
      categoryName,
      systemContent,
      runs: userContent,
      functionName: "polishRawSchedule",
    });
  } catch (error) {
    throw httpError(error);
  }
}
