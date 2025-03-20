import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import { RoutineType } from "@/types.js";
import { ObjectId } from "mongodb";
import { db } from "@/init.js";

type Props = {
  daysOffset: number;
  routine: RoutineType;
};

export default async function rescheduleSingleRoutine({
  daysOffset,
  routine,
}: Props) {

  try {
    await doWithRetries(async () =>
      db.collection("Routine").updateOne({ _id: new ObjectId(routine._id) }, [
        {
          $set: {
            startsAt: {
              $dateAdd: {
                startDate: "$startsAt",
                unit: "day",
                amount: daysOffset,
              },
            },
            lastDate: {
              $dateAdd: {
                startDate: "$lastDate",
                unit: "day",
                amount: daysOffset,
              },
            },
            allTasks: {
              $map: {
                input: "$allTasks",
                as: "task",
                in: {
                  $mergeObjects: [
                    "$$task",
                    {
                      ids: {
                        $map: {
                          input: "$$task.ids",
                          as: "id",
                          in: {
                            $mergeObjects: [
                              "$$id",
                              {
                                startsAt: {
                                  $dateAdd: {
                                    startDate: "$$id.startsAt",
                                    unit: "day",
                                    amount: daysOffset,
                                  },
                                },
                              },
                            ],
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      ])
    );

    await doWithRetries(async () =>
      db
        .collection("Task")
        .updateMany({ routineId: new ObjectId(routine._id) }, [
          {
            $set: {
              startsAt: {
                $dateAdd: {
                  startDate: "$startsAt",
                  unit: "day",
                  amount: daysOffset,
                },
              },
              expiresAt: {
                $dateAdd: {
                  startDate: "$expiresAt",
                  unit: "day",
                  amount: daysOffset,
                },
              },
            },
          },
        ])
    );
  } catch (error) {
    throw httpError(error);
  }
}
