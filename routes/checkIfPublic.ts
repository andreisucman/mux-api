import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { db } from "@/init.js";
import { ObjectId } from "mongodb";

type Props = {
  userId: string;
  concern: string;
};

export async function checkIfPublic({ userId, concern }: Props) {
  try {
    const routineData = await doWithRetries(() =>
      db.collection("RoutineData").findOne({ userId: new ObjectId(userId), concern }, { projection: { status: 1 } })
    );

    return { concern, isPublic: routineData?.status === "public" };
  } catch (err) {
    throw httpError(err);
  }
}
