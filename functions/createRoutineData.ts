import httpError from "@/helpers/httpError.js";
import { PartEnum } from "@/types.js";
import { db } from "@/init.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import { ObjectId } from "mongodb";
import { RoutineDataType } from "@/routes/changeRoutineDataStatus.js";

type Props = {
  userId: ObjectId;
  part: PartEnum;
  concern: string;
  userName: string;
};

export default async function createRoutineData({
  part,
  concern,
  userId,
  userName,
}: Props) {
  try {
    const existingDataCount = await doWithRetries(() =>
      db.collection("RoutineData").countDocuments({ userId, part, concern })
    );

    if (existingDataCount > 0) return;

    const newRoutineData: RoutineDataType = {
      concern,
      part,
      userId,
      userName,
      status: "hidden",
      monetization: "disabled",
    };

    await doWithRetries(() =>
      db.collection("RoutineData").insertOne(newRoutineData)
    );
  } catch (err) {
    throw httpError(err);
  }
}
