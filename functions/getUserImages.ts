import { ObjectId, Sort } from "mongodb";
import doWithRetries from "@/helpers/doWithRetries.js";
import { PartEnum, ProgressImageType } from "@/types.js";
import httpError from "@/helpers/httpError.js";
import { db } from "@/init.js";

type Props = {
  userId: string;
  part?: PartEnum;
  sort?: Sort;
};

export default async function getUsersImages({ userId, part, sort }: Props): Promise<ProgressImageType[] | null> {
  try {
    const filter: { [key: string]: any } = { userId: new ObjectId(userId) };

    if (part) filter.part = part;

    const latestProgressRecord = await doWithRetries(async () =>
      db
        .collection("Progress")
        .find(filter, { projection: { images: 1 } })
        .sort(sort || { createdAt: -1 })
        .next()
    );

    if (!latestProgressRecord) return null;

    const { images } = latestProgressRecord;

    return images;
  } catch (err) {
    throw httpError(err);
  }
}
