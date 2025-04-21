import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import {
  UserConcernType,
  TaskType,
  PartEnum,
  ModerationStatusEnum,
  CategoryNameEnum,
  RoutineStatusEnum,
} from "@/types.js";
import { CreateRoutineUserInfoType } from "@/types/createRoutineTypes.js";
import makeANewRoutine from "functions/makeANewRoutine.js";
import addAnalysisStatusError from "functions/addAnalysisStatusError.js";
import httpError from "@/helpers/httpError.js";
import getUsersImages from "./getUserImages.js";
import { db } from "init.js";
import reviewLatestRoutine from "@/functions/reviewLatestRoutine.js";

type Props = {
  userId: string;
  part: PartEnum;
  creationMode: "scratch" | "continue";
  incrementMultiplier?: number;
  categoryName: CategoryNameEnum;
  partConcerns: UserConcernType[];
  specialConsiderations: string;
  routineStartDate: string;
};

export default async function createRoutine({
  part,
  userId,
  incrementMultiplier = 1,
  categoryName,
  creationMode,
  partConcerns,
  routineStartDate,
  specialConsiderations,
}: Props) {
  try {
    if (partConcerns.length === 0) throw new Error("No concerns");

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
            latestConcernScores: 1,
            specialConsiderations: 1,
          },
        }
      )
    )) as unknown as CreateRoutineUserInfoType;

    if (!userInfo) throw new Error("This user doesn't exist");

    const partImages = await getUsersImages({ userId, part });

    const latestPartRoutine = await doWithRetries(async () =>
      db
        .collection("Routine")
        .find({
          userId: new ObjectId(userId),
          part,
          status: { $ne: RoutineStatusEnum.CANCELED },
          deletedOn: { $exists: false },
          startsAt: { $lte: new Date() },
        })
        .sort({ startsAt: -1 })
        .next()
    );

    if (creationMode === "continue" && latestPartRoutine) {
      const latestTasks = latestPartRoutine ? latestPartRoutine.allTasks : [];

      const latestSolutions = latestTasks.reduce((a: { [key: string]: number }, c: TaskType) => {
        if (a[c.key]) {
          a[c.key] += 1;
        } else {
          a[c.key] = 1;
        }
        return a;
      }, {});

      await reviewLatestRoutine({
        part,
        partImages,
        latestRoutineId: String(latestPartRoutine._id),
        partConcerns,
        userInfo,
        categoryName,
        latestSolutions,
        routineStartDate,
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
    throw httpError(error);
  }
}
