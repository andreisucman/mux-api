import { ObjectId } from "mongodb";
import createACommonTableOfProductFeatures from "functions/createACommonTableOfProductFeatures.js";
import extractVariantFeatures from "functions/extractVariantFeatures.js";
import doWithRetries from "helpers/doWithRetries.js";
import findTheBestVariant from "functions/findTheBestVariant.js";
import isTheProductValid from "functions/isTheProductValid.js";
import { ProductType, SuggestionVariant } from "@/types/findTheBestVariant.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";
import { UserInfoType } from "types.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";

interface ValidProductType extends ProductType {
  verdict: boolean;
}

type Props = {
  userInfo: UserInfoType;
  taskData: { productTypes: string[]; description: string; key: string };
  analysisType: string;
  criteria: string;
};

export default async function findProducts({
  userInfo,
  taskData,
  analysisType,
  criteria,
}: Props) {
  const { productTypes, description: taskDescription, key } = taskData;

  const { _id: userId, concerns } = userInfo;

  try {
    /* find the related variants */
    const variants = (await doWithRetries(async () =>
      db
        .collection("SuggestionVariant")
        .find({
          suggestion: { $in: productTypes },
        })
        .toArray()
    )) as unknown as SuggestionVariant[];

    let allVariants = variants.flatMap((v) =>
      v.links
        .map((l) => ({ ...l, suggestion: v.suggestion, variant: v.variant }))
        .flat()
    );

    allVariants = allVariants.filter(
      (v, index, self) => index === self.findIndex((i) => i.asin === v.asin)
    ) as ProductType[];

    const productCheckPromises = allVariants.map((v) =>
      doWithRetries(async () =>
        isTheProductValid({
          userId: String(userId),
          taskDescription,
          variantData: v as ProductType,
        })
      )
    ) as Promise<ValidProductType>[];

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(userId), type: analysisType },
          { $inc: { progress: 2 } }
        )
    );

    const productCheckObjectsArray: ValidProductType[] = await Promise.all(
      productCheckPromises
    );

    const validProducts: ValidProductType[] = productCheckObjectsArray
      .filter((obj) => obj.verdict === true)
      .filter(Boolean);

    const updatedValidProducts: ProductType[] = validProducts.map(
      (item: ValidProductType) => {
        const { verdict, ...rest } = item;
        return { ...rest, type: "product" };
      }
    );

    const distinctSuggestionTypes = [
      ...new Set(updatedValidProducts.map((obj) => obj.suggestion)),
    ];

    const chosenProducts = [];

    for (const suggestionType of distinctSuggestionTypes) {
      const filteredProducts: ProductType[] = updatedValidProducts.filter(
        (object) => object.suggestion === suggestionType
      );
      const extractFeaturesPromises = filteredProducts.map((v) =>
        extractVariantFeatures({
          userId: String(userId),
          taskDescription,
          variantData: v,
        })
      );

      const extractedFeaturesObjectsArray = await Promise.all(
        extractFeaturesPromises
      );

      await doWithRetries(async () =>
        db
          .collection("AnalysisStatus")
          .updateOne(
            { userId: new ObjectId(userId), type: analysisType },
            { $inc: { progress: 3 } }
          )
      );

      const commonListOfFeatures = await createACommonTableOfProductFeatures({
        userId: String(userId),
        extractedVariantFeatures: extractedFeaturesObjectsArray,
      });

      await doWithRetries(async () =>
        db
          .collection("AnalysisStatus")
          .updateOne(
            { userId: new ObjectId(userId), type: analysisType },
            { $inc: { progress: 15 } }
          )
      );

      const resultArray = await findTheBestVariant({
        commonListOfFeatures,
        taskDescription,
        validProducts: filteredProducts,
        analysisType,
        userInfo,
        criteria,
        concerns,
        key,
      });

      chosenProducts.push(...resultArray);
    }

    return chosenProducts;
  } catch (err) {
    await addAnalysisStatusError({
      userId: String(userId),
      type: analysisType,
      message: err.message,
    });

    throw httpError(err);
  }
}
