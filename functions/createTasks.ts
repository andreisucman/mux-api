import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import setUtcMidnight from "helpers/setUtcMidnight.js";
import { daysFrom } from "helpers/utils.js";
import personalizeInstruction from "functions/personalizeInstruction.js";
import { tasksRequirePersonalizedInstruction } from "data/tasksRequirePersonalizedInstructions.js";
import {
  UserConcernType,
  UserInfoType,
  SuggestionType,
  TypeEnum,
  TaskType,
  PartEnum,
  TaskStatusEnum,
} from "types.js";
import {
  CreateRoutineAllSolutionsType,
  PersonalizedInfoType,
} from "types/createRoutineTypes.js";
import httpError from "helpers/httpError.js";
import { db } from "init.js";

interface DraftTaskType extends CreateRoutineAllSolutionsType {
  concern: string;
}

type Props = {
  type: TypeEnum;
  part: PartEnum;
  concerns: UserConcernType[];
  userInfo: UserInfoType;
  finalSchedule: { [key: string]: { key: string; concern: string }[] };
  allSolutions: CreateRoutineAllSolutionsType[];
  createOnlyTheseKeys?: string[];
};

export default async function createTasks({
  type,
  part,
  concerns,
  userInfo,
  finalSchedule,
  allSolutions,
  createOnlyTheseKeys,
}: Props) {
  const { _id: userId } = userInfo;

  try {
    if (!finalSchedule || !concerns || !type || !allSolutions)
      throw new Error("createTasks - inputs missing");

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
        };
      })
      .filter(Boolean);

    const personalizedInfo: PersonalizedInfoType[] = [];

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(userId), operationKey: type },
          { $inc: { progress: 2 } }
        )
    );

    for (const draftTask of draftTasks) {
      if (tasksRequirePersonalizedInstruction.includes(draftTask.key)) {
        const personalInstruction = await personalizeInstruction({
          type,
          userInfo,
          name: draftTask.name,
          instruction: draftTask.instruction,
          description: draftTask.description,
        });

        await doWithRetries(async () =>
          db
            .collection("AnalysisStatus")
            .updateOne(
              { userId: new ObjectId(userId), operationKey: type },
              { $inc: { progress: 2 } }
            )
        );

        personalizedInfo.push({
          instruction: personalInstruction,
          name: draftTask.name,
          key: draftTask.key,
        });
      }
    }

    const tasksToInsert = [];
    const dates = Object.keys(finalSchedule);
    const groupsOfTasks = Object.values(finalSchedule);

    for (let j = 0; j < groupsOfTasks.length; j++) {
      for (let i = 0; i < groupsOfTasks[j].length; i++) {
        const matchingDraft = draftTasks.find(
          (task) => task.key === groupsOfTasks[j][i].key
        );

        if (!matchingDraft) continue;

        const relevantInfo = personalizedInfo.find(
          (record) => record.key === groupsOfTasks[j][i].key
        );

        const startsAt = setUtcMidnight({
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
          status: "active" as TaskStatusEnum,
          ...matchingDraft,
          suggestions: [] as SuggestionType[],
          productsPersonalized: false,
          proofEnabled: true,
          type,
          part,
          startsAt,
          expiresAt,
          revisionDate: daysFrom({ date: startsAt, days: 30 }),
        };

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
