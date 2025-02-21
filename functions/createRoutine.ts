import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import { daysFrom, DaysFromProps } from "helpers/utils.js";
import {
  UserConcernType,
  TaskStatusEnum,
  TaskType,
  PartEnum,
  ModerationStatusEnum,
  CategoryNameEnum,
  RoutineStatusEnum,
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
import getUsersImages from "./getUserImages.js";
import { db } from "init.js";
import getLatestCompletedTasks from "./getLatestCompletedTasks.js";

type Props = {
  userId: string;
  part: PartEnum;
  categoryName: CategoryNameEnum;
  concerns: UserConcernType[];
  specialConsiderations: string;
  routineStartDate: string;
};

export default async function createRoutine({
  part,
  userId,
  categoryName,
  concerns,
  routineStartDate,
  specialConsiderations,
}: Props) {
  try {
    if (concerns.length === 0) throw new Error("No concerns");

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
            name: 1,
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

    const partConcerns = concerns.filter((c) => c.part === part);

    const concernNames = partConcerns.map((obj) => obj.name);

    const allSolutions = (await doWithRetries(async () =>
      db
        .collection("Solution")
        .find(
          { nearestConcerns: { $in: concernNames } },
          {
            projection: {
              instruction: 1,
              description: 1,
              requisite: 1,
              example: 1,
              color: 1,
              name: 1,
              key: 1,
              icon: 1,
              recipe: 1,
              restDays: 1,
              isRecipe: 1,
              suggestions: 1,
              productTypes: 1,
              embedding: 1,
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
    });

    const latestRelevantTask = await doWithRetries(async () =>
      db
        .collection("Task")
        .find(
          {
            userId: new ObjectId(userId),
            part,
          },
          { projection: { startsAt: 1 } }
        )
        .sort({ startsAt: -1 })
        .next()
    );

    const daysFromPayload: DaysFromProps = {
      days: -8,
    };

    if (latestRelevantTask) daysFromPayload.date = latestRelevantTask.startsAt;

    const oneWeekAgo = daysFrom(daysFromPayload);

    const existingActiveTask = await doWithRetries(async () =>
      db.collection("Task").findOne(
        {
          userId: new ObjectId(userId),
          status: TaskStatusEnum.ACTIVE,
          part,
        },
        { projection: { routineId: 1 } }
      )
    );

    const latestCompletedTasks = await doWithRetries(async () =>
      getLatestCompletedTasks({
        userId,
        from: daysFrom({ date: new Date(routineStartDate), days: -14 }),
      })
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
                nextCanStartDate: { $lte: new Date(routineStartDate) },
              },
            ],
            part,
          },
          { projection: { _id: 0 } }
        )
        .sort({ startsAt: 1 })
        .toArray()
    )) as unknown as TaskType[];

    const partImages = await getUsersImages({ userId, part });

    if (existingActiveTask) {
      await updateCurrentRoutine({
        part,
        partImages,
        routineId: existingActiveTask.routineId,
        partConcerns,
        userInfo,
        allSolutions,
        categoryName,
        routineStartDate,
      });
    } else if (draftTasksToProlong.length > 0) {
      await prolongPreviousRoutine({
        part,
        partImages,
        partConcerns,
        userInfo,
        allSolutions,
        routineStartDate,
        tasksToProlong: draftTasksToProlong,
        canceledTaskKeys: latestMonthCanceledKeys,
        categoryName,
        latestCompletedTasks,
      });
    } else {
      await makeANewRoutine({
        part,
        userId,
        partImages,
        userInfo,
        partConcerns,
        allSolutions,
        routineStartDate,
        specialConsiderations,
        categoryName,
      });
    }
  } catch (error) {
    await addAnalysisStatusError({
      userId: String(userId),
      message: "An unexpected error occured. Please try again.",
      originalMessage: error.message,
      operationKey: "routine",
    });
    throw httpError(error);
  }
}
