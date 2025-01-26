import { ObjectId } from "mongodb";
import { db } from "init.js";
import getClosestTaskDates from "functions/getClosestTaskDates.js";
import doWithRetries from "helpers/doWithRetries.js";
import { RoutineType, TaskStatusEnum, TaskType } from "types.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  filter?: { [key: string]: any };
  returnOnlyRoutines?: boolean;
};

export default async function getLatestRoutinesAndTasks({
  userId,
  filter = {},
  returnOnlyRoutines,
}: Props) {
  try {
    const match = { userId: new ObjectId(userId), ...filter };
    const routines = await doWithRetries(
      async () =>
        await db
          .collection("Routine")
          .aggregate([
            { $match: match },
            { $sort: { createdAt: -1 } },
            {
              $group: {
                _id: "$part",
                tempId: { $first: "$_id" },
                type: { $first: "$type" },
                part: { $first: "$part" },
                finalSchedule: { $first: "$finalSchedule" },
                createdAt: { $first: "$createdAt" },
                lastDate: { $first: "$lastDate" },
                allTasks: { $first: "$allTasks" },
                status: { $first: "$status" },
              },
            },
            {
              $project: {
                _id: "$tempId",
                type: 1,
                part: 1,
                finalSchedule: 1,
                createdAt: 1,
                allTasks: 1,
                lastDate: 1,
                status: 1,
              },
            },
          ])
          .toArray()
    );

    if (!routines || routines.length === 0) {
      return { routines: [] as RoutineType[], tasks: [] as TaskType[] };
    }

    if (returnOnlyRoutines) {
      return { routines, tasks: [] as TaskType[] };
    }

    const closestDates = await getClosestTaskDates({
      routineIds: routines.map((r) => r._id),
    });

    const faceRecord = closestDates.find((r) => r.part === "face");
    const mouthRecord = closestDates.find((r) => r.part === "mouth");
    const scalpRecord = closestDates.find((r) => r.part === "scalp");
    const bodyRecord = closestDates.find((r) => r.part === "body");
    const healthRecord = closestDates.find((r) => r.part === "health");

    // Initialize facet as an empty object
    const facet: any = {};
    const project = {
      _id: 1,
      name: 1,
      key: 1,
      icon: 1,
      color: 1,
      type: 1,
      status: 1,
      part: 1,
      routineId: 1,
      isRecipe: 1,
      description: 1,
      startsAt: 1,
      completedAt: 1,
      expiresAt: 1,
    };

    if (faceRecord) {
      facet.face = [
        {
          $match: {
            routineId: new ObjectId(faceRecord.routineId),
            startsAt: new Date(faceRecord.startsAt),
          },
        },
        { $project: project },
      ];
    }

    if (mouthRecord) {
      facet.mouth = [
        {
          $match: {
            routineId: new ObjectId(mouthRecord.routineId),
            startsAt: new Date(mouthRecord.startsAt),
          },
        },
        { $project: project },
      ];
    }

    if (scalpRecord) {
      facet.scalp = [
        {
          $match: {
            routineId: new ObjectId(scalpRecord.routineId),
            startsAt: new Date(scalpRecord.startsAt),
          },
        },
        { $project: project },
      ];
    }

    if (healthRecord) {
      facet.health = [
        {
          $match: {
            routineId: new ObjectId(healthRecord.routineId),
            startsAt: new Date(healthRecord.startsAt),
          },
        },
        { $project: project },
      ];
    }

    if (bodyRecord) {
      facet.body = [
        {
          $match: {
            routineId: new ObjectId(bodyRecord.routineId),
            startsAt: new Date(bodyRecord.startsAt),
          },
        },
        { $project: project },
      ];
    }

    // If facet is empty, return empty arrays
    if (Object.keys(facet).length === 0) {
      return { routines: [] as RoutineType[], tasks: [] as TaskType[] };
    }

    const tasks = await doWithRetries(
      async () =>
        await db
          .collection("Task")
          .aggregate([
            {
              $match: {
                status: {
                  $in: [TaskStatusEnum.ACTIVE, TaskStatusEnum.COMPLETED],
                },
              },
            },
            {
              $facet: facet,
            },
            {
              $project: {
                tasks: {
                  $concatArrays: [
                    { $ifNull: ["$health", []] },
                    { $ifNull: ["$face", []] },
                    { $ifNull: ["$mouth", []] },
                    { $ifNull: ["$scalp", []] },
                    { $ifNull: ["$body", []] },
                  ],
                },
              },
            },
            { $unwind: "$tasks" },
            { $replaceRoot: { newRoot: "$tasks" } },
            {
              $sort: {
                status: 1,
                startsAt: 1,
              },
            },
          ])
          .toArray()
    );

    return { routines, tasks };
  } catch (err) {
    throw httpError(err);
  }
}
