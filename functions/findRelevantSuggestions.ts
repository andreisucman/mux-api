import doWithRetries from "@/helpers/doWithRetries.js";
import { adminDb, db } from "@/init.js";
import { SuggestionType } from "@/types.js";

export default async function findRelevantSuggestions(
  productTypes: string[]
): Promise<SuggestionType[]> {
  if (!productTypes.length) return [];

  const shouldClauses = productTypes
    .filter((t) => Boolean(t?.trim()))
    .map((type) => ({
      autocomplete: {
        query: type,
        path: "suggestion",
        tokenOrder: "sequential",
      },
    }));

  if (!shouldClauses.length) return [];

  const pipeline = [
    {
      $search: {
        index: "suggestion_product_types",
        compound: {
          should: shouldClauses,
        },
      },
    },
  ];

  const relevantSuggestions = (await doWithRetries(async () =>
    db.collection("Suggestion").aggregate(pipeline).toArray()
  )) as unknown as SuggestionType[];

  const productTypesSet = new Set(
    relevantSuggestions.map((so) => so.suggestion)
  );

  const productTypesNotFound = [];

  for (const type of productTypes) {
    if (!productTypesSet.has(type)) productTypesNotFound.push(type);
  }

  if (productTypesNotFound.length > 0) {
    const updateOps = productTypesNotFound.map((name) => ({
      updateOne: {
        filter: { name },
        update: { $inc: { count: 1 }, $set: { updatedAt: new Date() } },
        upsert: true,
      },
    }));

    await doWithRetries(async () =>
      adminDb.collection("MissingProductType").bulkWrite(updateOps)
    );
  }

  return relevantSuggestions;
}
