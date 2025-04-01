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
                              cond: { $ne: ["$$id.status", "deleted"] },
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
                                $and: [
                                  { $ne: ["$$id.status", "deleted"] },
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
              startsAt: {
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
                                $and: [
                                  { $ne: ["$$id.status", "deleted"] },
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
