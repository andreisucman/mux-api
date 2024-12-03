import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import { SexEnum, PartEnum, TypeEnum } from "types.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  currentScore: number;
  potentialScore: number;
  type: TypeEnum;
  sex: SexEnum;
  part: PartEnum;
  ageInterval: string;
};

export default async function calculateHigherThanPart({
  userId,
  currentScore,
  potentialScore,
  part,
  type,
  sex,
  ageInterval,
}: Props) {
  try {
    const partAnalysis = await doWithRetries(async () =>
      db
        .collection("Progress")
        .aggregate([
          {
            $match: {
              userId: { $ne: new ObjectId(userId) },
              type,
              part,
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
                    "scores.overall": { $lt: currentScore },
                  },
                },
                { $count: "count" },
              ],
              lowerThanPotential: [
                {
                  $match: {
                    "scores.overall": { $lt: potentialScore },
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
                $ifNull: [{ $arrayElemAt: ["$lowerThanCurrent.count", 0] }, 0],
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
        .next()
    );

    return {
      partCurrentlyHigherThan: partAnalysis.lowerThanCurrent,
      partPotentiallyHigherThan: partAnalysis.lowerThanPotential,
    };
  } catch (err) {
    throw httpError(err);
  }
}
