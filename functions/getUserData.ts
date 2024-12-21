import { db } from "init.js";
import { ObjectId } from "mongodb";
import getLatestRoutinesAndTasks from "functions/getLatestRoutineAndTasks.js";
import doWithRetries from "helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
};

async function getUserData({ userId }: Props) {
  if (!userId) return null;

  try {
    const userInfo = await doWithRetries(
      async () =>
        await db
          .collection("User")
          .findOne(
            { _id: new ObjectId(userId) },
            { projection: { password: 0 } }
          )
    );

    if (!userInfo) return null;

    const { routines, tasks } = await getLatestRoutinesAndTasks({ userId });

    const payload: any = {
      ...userInfo,
      tasks,
      routines,
    };

    return payload;
  } catch (err) {
    throw httpError(err);
  }
}

export default getUserData;
