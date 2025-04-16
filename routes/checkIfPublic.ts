import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { db } from "@/init.js";
import { ObjectId } from "mongodb";

type Props = {
  userId: string;
  concern?: string;
  concerns?: string[];
};

export async function checkIfPublic({ userId, concern, concerns }: Props) {
  try {
    const filter: { [key: string]: any } = { userId: new ObjectId(userId) };
    if (concern) filter.concern = concern;
    if (concerns) filter.concerns = concerns;

    const routineData = await doWithRetries(() =>
      db.collection("RoutineData").findOne(filter, { projection: { status: 1 } })
    );

    return { concern, isPublic: routineData?.status === "public" };
  } catch (err) {
    throw httpError(err);
  }
}
