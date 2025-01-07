import { ObjectId } from "mongodb";
import createACommonTableOfProductFeatures from "functions/createACommonTableOfProductFeatures.js";
import extractVariantFeatures from "functions/extractVariantFeatures.js";
import doWithRetries from "helpers/doWithRetries.js";
import findTheBestVariant from "functions/findTheBestVariant.js";
import isTheProductValid from "functions/isTheProductValid.js";
import {
  SuggestionType,
  ValidatedSuggestionType,
} from "@/types/findTheBestVariant.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";
import httpError from "@/helpers/httpError.js";
import { UserInfoType } from "types.js";
import { CategoryNameEnum } from "types.js";
import { db } from "init.js";

type Props = {
  userInfo: UserInfoType;
  taskData: { productTypes: string[]; description: string; key: string };
  analysisType: string;
  criteria: string;
  categoryName: CategoryNameEnum;
};

export default async function findProducts({
  userInfo,
  taskData,
  analysisType,
  criteria,
  categoryName,
}: Props) {
  const { productTypes, description: taskDescription } = taskData;

  const { _id: userId, concerns } = userInfo;

  try {
    const suggestions = (await doWithRetries(async () =>
      db
        .collection("Suggestion")
        .find({
          suggestion: { $in: productTypes },
        })
        .toArray()
    )) as unknown as SuggestionType[];

    const productCheckPromises = suggestions.map((draft) =>
      doWithRetries(async () =>
        isTheProductValid({
          userId: String(userId),
          taskDescription,
          data: draft,
          categoryName,
        })
      )
    );

    if (analysisType !== "findProductsForGeneralTasks") {
      await doWithRetries(async () =>
        db
          .collection("AnalysisStatus")
          .updateOne(
            { userId: new ObjectId(userId), operationKey: analysisType },
            { $inc: { progress: 2 } }
          )
      );
    }

    const productCheckObjectsArray: ValidatedSuggestionType[] =
      await Promise.all(productCheckPromises);

    const validProducts = productCheckObjectsArray
      .filter((obj) => obj.verdict === true)
      .filter(Boolean);

    const updatedValidProducts = validProducts.map(
      (item: ValidatedSuggestionType) => {
        const { verdict, ...rest } = item;
        return rest;
      }
    );

    const distinctSuggestionTypes = [
      ...new Set(updatedValidProducts.map((obj) => obj.suggestion)),
    ];

    const chosenProducts = [];

    for (const suggestionType of distinctSuggestionTypes) {
      const filteredProducts = updatedValidProducts.filter(
        (object) => object.suggestion === suggestionType
      );
      const extractFeaturesPromises = filteredProducts.map((v) =>
        extractVariantFeatures({
          userId: String(userId),
          taskDescription,
          variantData: v,
          categoryName,
        })
      );

      const extractedFeaturesObjectsArray = await Promise.all(
        extractFeaturesPromises
      );

      if (analysisType !== "findProductsForGeneralTasks") {
        await doWithRetries(async () =>
          db
            .collection("AnalysisStatus")
            .updateOne(
              { userId: new ObjectId(userId), operationKey: analysisType },
              { $inc: { progress: 3 } }
            )
        );
      }

      const commonListOfFeatures = await createACommonTableOfProductFeatures({
        userId: String(userId),
        extractedVariantFeatures: extractedFeaturesObjectsArray,
        categoryName,
      });

      if (analysisType !== "findProductsForGeneralTasks") {
        await doWithRetries(async () =>
          db
            .collection("AnalysisStatus")
            .updateOne(
              { userId: new ObjectId(userId), operationKey: analysisType },
              { $inc: { progress: 15 } }
            )
        );
      }

      const resultArray = await findTheBestVariant({
        commonListOfFeatures,
        taskDescription,
        validProducts: filteredProducts,
        analysisType,
        categoryName,
        userInfo,
        criteria,
        concerns,
      });

      chosenProducts.push(...resultArray);
    }

    return chosenProducts;
  } catch (err) {
    if (analysisType !== "findProductsForGeneralTasks") {
      await addAnalysisStatusError({
        userId: String(userId),
        operationKey: analysisType,
        originalMessage: err.message,
        message: "An unexpected error occured. Please try again.",
      });
    }

    throw httpError(err);
  }
}
