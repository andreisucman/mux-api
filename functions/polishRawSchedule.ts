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
};

export default async function polishRawSchedule({ rawSchedule, concerns, userId, categoryName }: Props) {
  try {
    const callback = (value: number) => {
      incrementProgress({
        operationKey: "routine",
        value: 1,
        userId,
      });
    };

    const listOfConcerns = JSON.stringify(concerns);

    let systemContent =
      "You are a dermatologist. The user gives you their improvement routine. Your goal is 1. Check iIf there are incompatible tasks and if yes separate them in to to a safe distance. 2. Optimize the position (order) of each task within the day for maximum effectiveness. DON'T REMOVE OR MODIFY THE NAMES OF THE TASKS. MAINTAIN THE SCHEMA FORMAT OF THE SCHEDULE. Be concise and to the point.";

    const userContent: RunType[] = [
      {
        model: "deepseek-reasoner",
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
        callback: () => callback(2),
      },
    ];

    userContent.push({
      model: "gpt-4o-mini",
      responseFormat: { type: "json_object" },
      content: [
        {
          type: "text",
          text: `Return the latest updated schedule as JSON in the original format.`,
        },
      ],
      callback: () => callback(2),
    });

    const polishedSchedule = await askRepeatedly({
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
