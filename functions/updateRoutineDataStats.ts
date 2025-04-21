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
  const routines =
    (await doWithRetries(() =>
      db.collection("Routine").countDocuments({
        userId: new ObjectId(userId),
        part,
        status: { $ne: RoutineStatusEnum.CANCELED },
        concerns: { $in: concerns },
        deletedOn: { $exists: false },
      })
    )) || 0;

  const completedTasks =
    (await doWithRetries(() =>
      db.collection("Task").countDocuments({
        userId: new ObjectId(userId),
        part,
        concern: { $in: concerns },
        status: TaskStatusEnum.COMPLETED,
      })
    )) || 0;

  const completedTasksWithProof =
    (await doWithRetries(() =>
      db.collection("Task").countDocuments({
        userId: new ObjectId(userId),
        part,
        concern: { $in: concerns },
        status: TaskStatusEnum.COMPLETED,
        proofId: { $exists: true },
      })
    )) || 0;

  const diaryRecords =
    (await doWithRetries(() =>
      db.collection("Diary").countDocuments({
        userId: new ObjectId(userId),
        part,
        concerns: { $in: concerns },
      })
    )) || 0;

  return { routines, completedTasks, completedTasksWithProof, diaryRecords };
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
