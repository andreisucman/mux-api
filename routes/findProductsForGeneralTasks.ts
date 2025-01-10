import { Router } from "express";
import findProducts from "functions/findProducts.js";
import doWithRetries from "helpers/doWithRetries.js";
import { CategoryNameEnum, UserInfoType } from "types.js";
import addCronLog from "functions/addCronLog.js";
import { db } from "init.js";
import { AnyBulkWriteOperation } from "mongodb";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.post("/", async (req, res, next) => {
  try {
    const randomUser = (await doWithRetries(async () =>
      db
        .collection("User")
        .aggregate([
          {
            $match: {
              demographics: { $exists: true },
              concerns: { $exists: true },
            },
          },
          { $sample: { size: 1 } },
          {
            $project: {
              specialConsiderations: 1,
              demographics: 1,
              concerns: 1,
            },
          },
        ])
        .next()
    )) as unknown as UserInfoType;

    const solutionsToProcess = (await doWithRetries(async () =>
      db
        .collection("Solution")
        .find()
        .project({
          productTypes: 1,
          description: 1,
          key: 1,
        })
        .toArray()
    )) as unknown as {
      productTypes: string[];
      description: string;
      key: string;
    }[];

    const toUpdate: AnyBulkWriteOperation<any>[] = [];

    for (const solution of solutionsToProcess) {
      const suggestions = await findProducts({
        userInfo: randomUser,
        taskData: solution,
        criteria:
          "I value safety and proof of effectiveness first. I can afford more expensive products if they have proven durability.",
        categoryName: CategoryNameEnum.OTHER,
        analysisType: "findProductsForGeneralTasks",
      });

      toUpdate.push({
        updateOne: {
          filter: { key: solution.key },
          update: { $set: { suggestions } },
        },
      });
    }

    await doWithRetries(async () =>
      db
        .collection("Solution")
        .bulkWrite(toUpdate as AnyBulkWriteOperation<any>[])
    );

    const message = `${toUpdate.length} solutions updated and ${
      solutionsToProcess.length - toUpdate.length
    } failed`;

    addCronLog({
      functionName: "findProductsForGeneralTasks",
      isError: false,
      message,
    });
  } catch (err) {
    addCronLog({
      functionName: "findProductsForGeneralTasks",
      isError: true,
      message: err.message,
    });
    next(httpError(err.message, err.status));
  }
});

export default route;
