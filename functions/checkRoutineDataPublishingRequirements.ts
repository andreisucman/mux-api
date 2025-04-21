import doWithRetries from "@/helpers/doWithRetries.js";
import { normalizeString } from "@/helpers/utils.js";
import { db } from "@/init.js";
import { ObjectId } from "mongodb";

type Props = {
  userId: string;
  part: string;
  concern: string;
};

const checkPublishingRequirements = async ({ userId, part, concern }: Props) => {
  const response = { passed: false, message: "" };

  const numberOfProgresses = await doWithRetries(() =>
    db.collection("Progress").countDocuments({ userId: new ObjectId(userId), part, concern })
  );

  const concernName = normalizeString(concern).toLowerCase();

  if (numberOfProgresses < 2) {
    response.message = `You have to have at least one pair of before-after images for the ${concernName} concern.`;
    return response;
  }

  const earliestConcernScoreRecord = await doWithRetries(() =>
    db
      .collection("Progress")
      .find({ userId: new ObjectId(userId), part, concern })
      .project({ concernScore: 1 })
      .sort({ createdAt: 1 })
      .next()
  );

  const { concernScore: firstConcernScoreObject } = earliestConcernScoreRecord;

  const latestConcernScoreRecord = await doWithRetries(() =>
    db
      .collection("Progress")
      .find({ userId: new ObjectId(userId), part, concern })
      .project({ concernScore: 1 })
      .sort({ createdAt: -1 })
      .next()
  );

  const { concernScore: lastConcernScoreObject } = latestConcernScoreRecord;
  const improvementTresholdPassed =
    lastConcernScoreObject.value - firstConcernScoreObject.value <= Number(process.env.IMPROVEMENT_RATE_TRESHOLD) * -1;

  if (improvementTresholdPassed) {
    response.message = `You have to have at least ${Number(
      process.env.IMPROVEMENT_RATE_TRESHOLD
    )} points of improvement between your before-after images for the ${concernName} concern.`;
    return response;
  }

  response.passed = true;
};

export default checkPublishingRequirements;
