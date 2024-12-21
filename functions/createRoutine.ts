import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import { daysFrom } from "helpers/utils.js";
import {
  UserConcernType,
  TaskStatusEnum,
  TypeEnum,
  TaskType,
  PartEnum,
  ModerationStatusEnum,
} from "@/types.js";
import {
  CreateRoutineUserInfoType,
  CreateRoutineAllSolutionsType,
} from "@/types/createRoutineTypes.js";
import makeANewRoutine from "functions/makeANewRoutine.js";
import getLatestTaskStatus from "functions/getLatestTaskStatus.js";
import addAnalysisStatusError from "functions/addAnalysisStatusError.js";
import prolongPreviousRoutine from "functions/prolongPreviousRoutine.js";
import updateCurrentRoutine from "functions/updateCurrentRoutine.js";
import httpError from "@/helpers/httpError.js";
import { db } from "init.js";

type Props = {
  userId: string;
  type: TypeEnum;
  part: PartEnum;
  partConcerns: UserConcernType[];
  specialConsiderations: string;
};

export default async function createRoutine({
  type,
  part,
  userId,
  partConcerns,
  specialConsiderations,
}: Props) {
  if (partConcerns.length === 0) return;

  try {
    const userInfo = (await doWithRetries(async () =>
      db.collection("User").findOne(
        {
          _id: new ObjectId(userId),
          moderationStatus: ModerationStatusEnum.ACTIVE,
        },
        {
          projection: {
            demographics: 1,
            concerns: 1,
            ageInterval: 1,
            city: 1,
            country: 1,
            timeZone: 1,
            nextRoutine: 1,
            specialConsiderations: 1,
          },
        }
      )
    )) as unknown as CreateRoutineUserInfoType;

    if (!userInfo) throw new Error("This user doesn't exist");

    const concernNames = partConcerns.map((obj) => obj.name);

    const allSolutions = (await doWithRetries(async () =>
      db
        .collection("Solution")
        .find(
          { nearestConcerns: { $in: concernNames } },
          {
            projection: {
              requiredSubmissions: 1,
              instruction: 1,
              description: 1,
              requisite: 1,
              example: 1,
              color: 1,
              name: 1,
              type: 1,
              key: 1,
              icon: 1,
              recipe: 1,
              restDays: 1,
              isRecipe: 1,
              productTypes: 1,
              defaultSuggestions: 1,
              _id: 0,
            },
          }
        )
        .toArray()
    )) as unknown as CreateRoutineAllSolutionsType[];

    /* get previously completed */
    const latestMonthCanceledKeys: string[] = await getLatestTaskStatus({
      userId,
      days: 30,
      statuses: ["canceled"] as TaskStatusEnum[],
      type,
    });

    const daysToProlong = 7;
    const oneWeekAgo = daysFrom({ days: daysToProlong * -1 });

    const existingActiveTask = await doWithRetries(async () =>
      db
        .collection("Task")
        .findOne(
          { userId: new ObjectId(userId), type, part, status: "active" },
          { projection: { routineId: 1 } }
        )
    );

    const draftTasksToProlong = (await doWithRetries(async () =>
      db
        .collection("Task")
        .find(
          {
            userId: new ObjectId(userId),
            key: { $nin: latestMonthCanceledKeys },
            startsAt: { $gte: new Date(oneWeekAgo) },
            $or: [
              {
                nextCanStartDate: { $exists: false },
              },
              {
                nextCanStartDate: { $lte: new Date() },
              },
            ],
            part,
          },
          { projection: { _id: 0 } }
        )
        .sort({ startsAt: 1 })
        .toArray()
    )) as unknown as TaskType[];

    if (draftTasksToProlong.length > 0) {
      if (existingActiveTask) {
        await updateCurrentRoutine({
          type,
          part,
          routineId: existingActiveTask.routineId,
          concerns: partConcerns,
          userInfo,
          allSolutions,
          specialConsiderations,
        });
      } else {
        await prolongPreviousRoutine({
          type,
          part,
          concerns: partConcerns,
          userInfo,
          allSolutions,
          tasksToProlong: draftTasksToProlong,
        });
      }
    } else {
      await makeANewRoutine({
        type,
        part,
        userId,
        userInfo,
        concerns: partConcerns,
        allSolutions,
        specialConsiderations,
      });
    }
  } catch (error) {
    await addAnalysisStatusError({
      userId: String(userId),
      message: "An unexpected error occured. Please try again.",
      originalMessage: error.message,
      operationKey: type,
    });
    throw httpError(error);
  }
}
