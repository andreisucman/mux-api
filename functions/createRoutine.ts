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
} from "@/types.js";
import { CreateRoutineUserInfoType } from "@/types/createRoutineTypes.js";
import makeANewRoutine from "functions/makeANewRoutine.js";
import addAnalysisStatusError from "functions/addAnalysisStatusError.js";
import prolongPreviousRoutine from "functions/prolongPreviousRoutine.js";
import updateCurrentRoutine from "functions/updateCurrentRoutine.js";
import httpError from "@/helpers/httpError.js";
import getUsersImages from "./getUserImages.js";
import getLatestCompletedTasks from "./getLatestCompletedTasks.js";
import { db } from "init.js";

type Props = {
  userId: string;
  part: PartEnum;
  creationMode: "scratch" | "continue";
  incrementMultiplier?: number;
  categoryName: CategoryNameEnum;
  concerns: UserConcernType[];
  specialConsiderations: string;
  routineStartDate: string;
};

export default async function createRoutine({
  part,
  userId,
  incrementMultiplier = 1,
  categoryName,
  creationMode,
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

    const partImages = await getUsersImages({ userId, part });

    const existingActiveTasks = await doWithRetries(async () =>
      db
        .collection("Task")
        .find(
          {
            userId: new ObjectId(userId),
            status: TaskStatusEnum.ACTIVE,
            part,
          },
          { projection: { routineId: 1 } }
        )
        .toArray()
    );

    const daysFromPayload: DaysFromProps = {
      days: -8,
    };

    const oneWeekAgo = daysFrom(daysFromPayload);

    const tasksToProlong = (await doWithRetries(async () =>
      db
        .collection("Task")
        .find(
          {
            userId: new ObjectId(userId),
            status: {
              $in: [
                TaskStatusEnum.EXPIRED,
                TaskStatusEnum.COMPLETED,
                TaskStatusEnum.INACTIVE,
              ],
            },
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

    const latestCompletedTasks = await doWithRetries(async () =>
      getLatestCompletedTasks({
        userId,
        from: daysFrom({ date: new Date(), days: -14 }),
      })
    );

    if (existingActiveTasks.length) {
      const currentSolutions = existingActiveTasks.reduce(
        (a: { [key: string]: number }, c: TaskType) => {
          if (a[c.key]) {
            a[c.key] += 1;
          } else {
            a[c.key] = 1;
          }
          return a;
        },
        {}
      );
      await updateCurrentRoutine({
        part,
        partImages,
        routineId: existingActiveTasks[0].routineId,
        partConcerns,
        userInfo,
        categoryName,
        currentSolutions,
        routineStartDate,
        incrementMultiplier,
      });
    } else if (creationMode === "continue" && tasksToProlong.length) {
      await prolongPreviousRoutine({
        part,
        partImages,
        partConcerns,
        userInfo,
        tasksToProlong,
        routineStartDate,
        categoryName,
        latestCompletedTasks,
        incrementMultiplier,
      });
    } else {
      await makeANewRoutine({
        part,
        userId,
        partImages,
        userInfo,
        partConcerns,
        routineStartDate,
        specialConsiderations,
        categoryName,
        incrementMultiplier,
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
