import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";
import { UserConcernType } from "@/types.js";

export default async function validateConcerns(originalConcerns: UserConcernType[]) {
  const sanitatedUserUploadedConcerns = await doWithRetries(() =>
    db
      .collection("Concern")
      .find({ name: { $in: originalConcerns.map((c) => c.name) } }, { projection: { name: 1 } })
      .toArray()
  );

  const arrayOfExistingConcerns = sanitatedUserUploadedConcerns.map((co) => co.name);

  return originalConcerns.filter((co) => arrayOfExistingConcerns.includes(co.name));
}
