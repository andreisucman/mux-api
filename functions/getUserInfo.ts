import { ObjectId } from "mongodb";
import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { db } from "@/init.js";
import { UserType } from "@/types.js";

type Props = {
  userId?: string;
  userName?: string;
  projection?: { [key: string]: number };
};

export default async function getUserInfo({
  userId,
  userName,
  projection,
}: Props): Promise<Partial<UserType> | null> {
  try {
    if (!userId && !userName) throw httpError("No userId and name");

    const filter: { [key: string]: any } = {};

    if (userId) filter._id = new ObjectId(userId);
    if (userName) filter.name = userName;

    const projectionStage = projection ? { projection } : undefined;

    const userInfo = await doWithRetries(() =>
      db.collection("User").findOne(filter, projectionStage)
    );

    return userInfo;
  } catch (err) {
    throw httpError(err);
  }
}
