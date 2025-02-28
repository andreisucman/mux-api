import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import setToMidnight from "@/helpers/setToMidnight.js";
import { daysFrom } from "helpers/utils.js";
import personalizeInstruction from "functions/personalizeInstruction.js";
import { tasksRequirePersonalizedInstruction } from "data/tasksRequirePersonalizedInstructions.js";
import {
  UserInfoType,
  TaskType,
  PartEnum,
  TaskStatusEnum,
  CategoryNameEnum,
} from "types.js";
import {
  CreateRoutineAllSolutionsType,
  PersonalizedInfoType,
} from "types/createRoutineTypes.js";
import httpError from "helpers/httpError.js";
import { ScheduleTaskType } from "@/helpers/turnTasksIntoSchedule.js";
import incrementProgress from "@/helpers/incrementProgress.js";

interface DraftTaskType extends CreateRoutineAllSolutionsType {
  concern: string;
}

type Props = {
  part: PartEnum;
  userInfo: UserInfoType;
  finalSchedule: { [key: string]: ScheduleTaskType[] };
  allSolutions: CreateRoutineAllSolutionsType[];
  createOnlyTheseKeys?: string[];
  categoryName: CategoryNameEnum;
};

export default async function createTasks({
  part,
  userInfo,
  finalSchedule,
  allSolutions,
  categoryName,
  createOnlyTheseKeys,
}: Props) {
  const { _id: userId, name: userName } = userInfo;

  try {
    const values = Object.values(finalSchedule);
    const rawTasks = values.flat();

    let uniqueSolutions = [...new Set(rawTasks.map((entry) => entry.key))];

    if (createOnlyTheseKeys) {
      uniqueSolutions = uniqueSolutions.filter((solutionKey) =>
        createOnlyTheseKeys.includes(solutionKey)
      );
    }

    const draftTasks: DraftTaskType[] = uniqueSolutions
      .map((key) => {
        const rawTaskObject = rawTasks.find((pair) => pair.key === key);
        const informationObject = allSolutions.find(
          (object) => object.key === key
        );

        if (!rawTaskObject || !informationObject) return null;

        return {
          key: rawTaskObject.key,
          concern: rawTaskObject.concern,
          ...informationObject,
          completedAt: null,
        };
      })
      .filter(Boolean);

    const personalizedInfo: PersonalizedInfoType[] = [];

    await incrementProgress({
      value: 2,
      operationKey: "routine",
      userId: String(userId),
    });

    for (const draftTask of draftTasks) {
      if (tasksRequirePersonalizedInstruction.includes(draftTask.key)) {
        const { instruction: personalInstruction, productTypes } =
          await personalizeInstruction({
            userInfo,
            categoryName,
            name: draftTask.name,
            instruction: draftTask.instruction,
            description: draftTask.description,
          });

        await incrementProgress({
          value: 2,
          operationKey: "routine",
          userId: String(userId),
        });

        personalizedInfo.push({
          instruction: personalInstruction,
          name: draftTask.name,
          key: draftTask.key,
          productTypes,
        });
      }
    }

    const tasksToInsert = [];
    const dates = Object.keys(finalSchedule);
    const groupsOfTasks = Object.values(finalSchedule);

    for (let j = 0; j < groupsOfTasks.length; j++) {
      for (let i = 0; i < groupsOfTasks[j].length; i++) {
        const scheduleTask = groupsOfTasks[j][i];

        const matchingDraft = draftTasks.find(
          (task) => task.key === scheduleTask.key
        );

        if (!matchingDraft) continue;

        const relevantInfo = personalizedInfo.find(
          (record) => record.key === scheduleTask.key
        );

        const startsAt = setToMidnight({
          date: new Date(dates[j]),
          timeZone: userInfo.timeZone,
        });

        const expiresAt = daysFrom({
          date: startsAt,
          days: 1,
        });

        let insertObject: Partial<TaskType> = {
          _id: new ObjectId(),
          userId: new ObjectId(userId),
          status: TaskStatusEnum.ACTIVE,
          ...matchingDraft,
          proofEnabled: true,
          part,
          startsAt,
          completedAt: null,
          expiresAt,
        };

        if (userName) {
          insertObject.userName = userName;
        }

        if (relevantInfo) {
          insertObject = {
            ...insertObject,
            ...relevantInfo,
          };
        }

        tasksToInsert.push(insertObject);
      }
    }

    return tasksToInsert;
  } catch (error) {
    throw httpError(error);
  }
}
