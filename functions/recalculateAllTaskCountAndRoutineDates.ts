import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { db } from "@/init.js";
import { ObjectId } from "mongodb";

export default async function recalculateAllTaskCountAndRoutineDates(
  routineIds: string[]
) {
  try {
    const routineTaskCountUpdateOps = routineIds.map((routineId) => ({
      updateOne: {
        filter: { _id: new ObjectId(routineId) },
        update: [
          {
            $set: {
              allTasks: {
                $map: {
                  input: "$allTasks",
                  as: "group",
                  in: {
                    $mergeObjects: [
                      "$$group",
                      {
                        total: {
                          $size: {
                            $filter: {
                              input: "$$group.ids",
                              as: "id",
                              cond: { $eq: ["$$id.status", "active"] },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
              lastDate: {
                $max: {
                  $map: {
                    input: "$allTasks",
                    as: "task",
                    in: {
                      $max: {
                        $map: {
                          input: {
                            $filter: {
                              input: "$$task.ids",
                              as: "id",
                              cond: {
                                $or: [
                                  { $eq: ["$$id.status", "active"] },
                                  { $eq: ["$$id.status", "completed"] },
                                ],
                              },
                            },
                          },
                          as: "filteredId",
                          in: "$$filteredId.startsAt",
                        },
                      },
                    },
                  },
                },
              },
              startDate: {
                $min: {
                  $map: {
                    input: "$allTasks",
                    as: "task",
                    in: {
                      $min: {
                        $map: {
                          input: {
                            $filter: {
                              input: "$$task.ids",
                              as: "id",
                              cond: {
                                $or: [
                                  { $eq: ["$$id.status", "active"] },
                                  { $eq: ["$$id.status", "completed"] },
                                ],
                              },
                            },
                          },
                          as: "filteredId",
                          in: "$$filteredId.startsAt",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    }));

    await doWithRetries(async () =>
      db.collection("Routine").bulkWrite(routineTaskCountUpdateOps)
    );
  } catch (err) {
    throw httpError(err);
  }
}
