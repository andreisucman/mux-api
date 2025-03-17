import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { db } from "@/init.js";
import { ObjectId } from "mongodb";

type Props = {
  userId: string;
  part: string;
};

export async function checkIfPublic({ userId, part }: Props) {
  try {
    const routineData = await doWithRetries(() =>
      db
        .collection("RoutineData")
        .findOne(
          { userId: new ObjectId(userId), part },
          { projection: { status: 1 } }
        )
    );

    return routineData?.status === "public";
  } catch (err) {
    throw httpError(err);
  }
}
