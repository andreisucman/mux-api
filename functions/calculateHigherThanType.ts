import { ObjectId } from "mongodb";
import addErrorLog from "functions/addErrorLog.js";
import doWithRetries from "helpers/doWithRetries.js";
import { SexEnum, TypeEnum } from "types.js";
import { db } from "init.js";

type Props = {
  userId: string;
  currentScore: number;
  potentialScore: number;
  type: TypeEnum;
  sex: SexEnum;
  ageInterval: string;
};

export default async function calculateHigherThanType({
  userId,
  currentScore,
  potentialScore,
  ageInterval,
  type,
  sex,
}: Props) {
  try {
    const typeAnalysis = await doWithRetries({
      functionName: "calculateHigherThan",
      functionToExecute: async () =>
        db
          .collection("Progress")
          .aggregate([
            {
              $match: {
                userId: { $ne: new ObjectId(userId) },
                type,
                "demographics.sex": sex,
                "demographics.ageInterval": ageInterval,
              },
            },
            { $sort: { createdAt: -1 } },
            {
              $group: {
                _id: "$userId",
                lastRecord: { $first: "$$ROOT" },
              },
            },
            {
              $replaceRoot: { newRoot: "$lastRecord" },
            },
            {
              $facet: {
                totalCount: [{ $count: "count" }],
                lowerThanCurrent: [
                  {
                    $match: {
                      overall: { $lt: currentScore },
                    },
                  },
                  { $count: "count" },
                ],
                lowerThanPotential: [
                  {
                    $match: {
                      overall: { $lt: potentialScore },
                    },
                  },
                  { $count: "count" },
                ],
              },
            },
            {
              $project: {
                totalCount: {
                  $ifNull: [{ $arrayElemAt: ["$totalCount.count", 0] }, 0],
                },
                lowerThanCurrent: {
                  $ifNull: [
                    { $arrayElemAt: ["$lowerThanCurrent.count", 0] },
                    0,
                  ],
                },
                lowerThanPotential: {
                  $ifNull: [
                    { $arrayElemAt: ["$lowerThanPotential.count", 0] },
                    0,
                  ],
                },
              },
            },
            {
              $addFields: {
                lowerThanCurrentPercentage: {
                  $cond: {
                    if: { $gt: ["$totalCount", 0] },
                    then: {
                      $multiply: [
                        { $divide: ["$lowerThanCurrent", "$totalCount"] },
                        100,
                      ],
                    },
                    else: 0,
                  },
                },
                lowerThanPotentialPercentage: {
                  $cond: {
                    if: { $gt: ["$totalCount", 0] },
                    then: {
                      $multiply: [
                        { $divide: ["$lowerThanPotential", "$totalCount"] },
                        100,
                      ],
                    },
                    else: 0,
                  },
                },
              },
            },
            {
              $project: {
                _id: 0,
                lowerThanCurrent: "$lowerThanCurrentPercentage",
                lowerThanPotential: "$lowerThanPotentialPercentage",
              },
            },
          ])
          .next(),
    });

    return {
      typeCurrentlyHigherThan: typeAnalysis.lowerThanCurrent,
      typePotentiallyHigherThan: typeAnalysis.lowerThanPotential,
    };
  } catch (error) {
    addErrorLog({
      message: error.message,
      functionName: "calculateHigherThanType",
    });
    throw error;
  }
}
