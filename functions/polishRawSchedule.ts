import * as dotenv from "dotenv";
dotenv.config();

import askRepeatedly from "functions/askRepeatedly.js";
import incrementProgress from "helpers/incrementProgress.js";
import { UserConcernType, CategoryNameEnum } from "types.js";
import { RunType } from "types/askOpenaiTypes.js";
import httpError from "helpers/httpError.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";

type Props = {
  rawSchedule: { [key: string]: ScheduleTaskType[] };
  concerns: UserConcernType[];
  userId: string;
  categoryName: CategoryNameEnum;
  specialConsiderations: string;
};

export default async function polishRawSchedule({
  rawSchedule,
  concerns,
  userId,
  categoryName,
  specialConsiderations,
}: Props) {
  try {
    const callback = () =>
      incrementProgress({ operationKey: "routine", value: 1, userId });

    const listOfConcerns = JSON.stringify(concerns);

    const systemContent = `You are a dermatologist, dentist, and a fitness coach. The user gives you their improvement routine. It can contain tasks that conflict or repeat each other. Your goal is to optimize the schedule by removing, or reordering the tasks for the maximum safety and effectiveness. Be concise and to the point. MAINTAIN THE SCHEMA OF THE SCHEDULE.`;

    const userContent: RunType[] = [
      {
        isMini: false,
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

    userContent.push({
      isMini: false,
      model: "o3-mini",
      content: [
        {
          type: "text",
          text: `Should any of the tasks be moved to different dates for a safer or more effective experience? If yes, move them, if not, leave as is.`,
        },
      ],
      callback,
    });

    if (specialConsiderations) {
      userContent.push({
        isMini: true,
        model: "o3-mini",
        content: [
          {
            type: "text",
            text: `Does the schedule conflict with the following special consideration? Special consideration: ${specialConsiderations}. If yes, edit the schedule appropriately.`,
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
