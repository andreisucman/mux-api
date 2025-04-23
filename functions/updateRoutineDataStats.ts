import { PartEnum, RoutineStatusEnum, TaskStatusEnum } from "types.js";
import httpError from "@/helpers/httpError.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";
import { ObjectId } from "mongodb";

type Props = {
  userId: string;
  part: PartEnum;
  concerns: string[];
};

export async function getStatsForRoutineData({ userId, part, concerns }: Props) {
  const routineIdObjects =
    (await doWithRetries(() =>
      db
        .collection("Routine")
        .find(
          {
            userId: new ObjectId(userId),
            part,
            status: { $ne: RoutineStatusEnum.CANCELED },
            concerns: { $in: concerns },
            deletedOn: { $exists: false },
          },
          { projection: { _id: 1 } }
        )
        .toArray()
    )) || [];

  const routineIds = routineIdObjects.map((obj) => obj._id);

  const completedTasks =
    (await doWithRetries(() =>
      db.collection("Task").countDocuments({
        userId: new ObjectId(userId),
        routineId: { $in: routineIds },
        status: TaskStatusEnum.COMPLETED,
      })
    )) || 0;

  const completedTasksWithProof =
    (await doWithRetries(() =>
      db.collection("Task").countDocuments({
        userId: new ObjectId(userId),
        routineId: { $in: routineIds },
        status: TaskStatusEnum.COMPLETED,
        proofId: { $exists: true },
      })
    )) || 0;

  const diaryRecords =
    (await doWithRetries(() =>
      db.collection("Diary").countDocuments({
        userId: new ObjectId(userId),
        part,
        concern: { $in: concerns },
      })
    )) || 0;

  return { routines: routineIds.length, completedTasks, completedTasksWithProof, diaryRecords };
}

export default async function updateRoutineDataStats({ userId, part, concerns }: Props) {
  try {
    const relevantRoutineData = await doWithRetries(() =>
      db.collection("RoutineData").findOne({ userId: new ObjectId(userId), part, concern: { $in: concerns } })
    );

    if (!relevantRoutineData) return;

    const { completedTasks, completedTasksWithProof, diaryRecords, routines } = await getStatsForRoutineData({
      concerns,
      part,
      userId,
    });

    await doWithRetries(() =>
      db.collection("RoutineData").updateOne(
        {
          _id: relevantRoutineData._id,
        },
        { $set: { stats: { routines, completedTasks, completedTasksWithProof, diaryRecords } } }
      )
    );
  } catch (err) {
    httpError(err);
  }
}
