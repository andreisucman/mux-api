import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";
import { RoutineType } from "@/types.js";

export default async function getClosestRoutine(
  filter: { [key: string]: any },
  startDate: string
): Promise<RoutineType> {
  const result = await doWithRetries(() =>
    db
      .collection("Routine")
      .aggregate([
        { $match: filter },
        { $addFields: { diff: { $abs: { $subtract: ["$startsAt", new Date(startDate)] } } } },
        { $sort: { diff: 1 } },
        { $limit: 1 },
        { $unset: "diff" },
      ])
      .next()
  );

  return result as unknown as RoutineType;
}
