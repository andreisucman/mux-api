import { db } from "init.js";
import { ObjectId } from "mongodb";
import getLatestRoutinesAndTasks from "functions/getLatestRoutineAndTasks.js";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";

type Props = {
  userId: string;
};

async function getUserData({ userId }: Props) {
  try {
    const userInfo = await doWithRetries({
      functionToExecute: async () =>
        await db
          .collection("User")
          .findOne(
            { _id: new ObjectId(userId) },
            { projection: { password: 0 } }
          ),
      functionName: "getUserData function - getUser",
    });

    if (!userInfo) return null;

    const { routines, tasks } = await getLatestRoutinesAndTasks({ userId });

    const payload: any = {
      ...userInfo,
      tasks,
      routines,
    };

    return payload;
  } catch (err) {
    addErrorLog({ functionName: "getUserData", message: err.message });
    throw err;
  }
}

export default getUserData;
