import { db } from "init.js";
import { ObjectId } from "mongodb";
import getLatestTasks from "functions/getLatestTasks.js";
import doWithRetries from "helpers/doWithRetries.js";
import { defaultUserProjection } from "./checkIfUserExists.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
};

async function getUserData({ userId }: Props) {
  if (!userId) return null;

  try {
    const userInfo = await doWithRetries(
      async () =>
        await db.collection("User").findOne(
          { _id: new ObjectId(userId) },
          {
            projection: defaultUserProjection,
          }
        )
    );

    if (!userInfo) return null;

    const tasks = await getLatestTasks({
      userId,
      timeZone: userInfo.timeZone,
    });

    const payload: any = {
      ...userInfo,
      tasks,
    };

    return payload;
  } catch (err) {
    throw httpError(err);
  }
}

export default getUserData;
