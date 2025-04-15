import doWithRetries from "@/helpers/doWithRetries.js";
import { normalizeString } from "@/helpers/utils.js";
import { db } from "@/init.js";
import { ObjectId } from "mongodb";

type Props = {
  userId: string;
  concern: string;
};

const checkPublishingRequirements = async ({ userId, concern }: Props) => {
  const response = { passed: false, message: "" };

  const numberOfProgresses = await doWithRetries(() =>
    db.collection("Progress").countDocuments({ userId: new ObjectId(userId), "concerns.name": concern })
  );

  const concernName = normalizeString(concern).toLowerCase();

  if (numberOfProgresses < 2) {
    response.message = `You have to have at least one pair of before-after images for the ${concernName} concern.`;
    return response;
  }

  const earliestConcernScoreRecord = await doWithRetries(() =>
    db
      .collection("Progress")
      .find({ userId: new ObjectId(userId), "concerns.name": concern })
      .project({ concernScore: 1 })
      .sort({ createdAt: 1 })
      .next()
  );

  const { concernScore: firstConcernScoreObject } = earliestConcernScoreRecord;

  const latestConcernScoreRecord = await doWithRetries(() =>
    db
      .collection("Progress")
      .find({ userId: new ObjectId(userId), "concerns.name": concern })
      .project({ concernScore: 1 })
      .sort({ createdAt: -1 })
      .next()
  );

  const { concernScore: lastConcernScoreObject } = latestConcernScoreRecord;

  if (lastConcernScoreObject.value - firstConcernScoreObject.value < Number(process.env.IMPROVEMENT_RATE_TRESHOLD)) {
    response.message = `You have to have at least ${Number(
      process.env.IMPROVEMENT_RATE_TRESHOLD
    )} points of improvement between your before-after images for the ${concernName} concern.`;
    return response;
  }

  const numberOfCompletedConcernTasks = await doWithRetries(() =>
    db.collection("Task").countDocuments({ userId: new ObjectId(userId), concern })
  );

  const numberOfCompletedConcernTasksWithProofs = await doWithRetries(() =>
    db.collection("Task").countDocuments({ userId: new ObjectId(userId), concern, proofId: { $exists: true } })
  );

  const proofCompletionRate =
    numberOfCompletedConcernTasks > 0 ? numberOfCompletedConcernTasksWithProofs / numberOfCompletedConcernTasks : 0;

  if (proofCompletionRate < Number(process.env.PROOF_COMPLETION_RATE_TRESHOLD)) {
    response.message = `You have to have at least ${
      Number(process.env.PROOF_COMPLETION_RATE_TRESHOLD) * 100
    }% of completions with proofs for the ${concernName} concern. Your current rate is ${
      Math.round(proofCompletionRate) * 100
    }%`;
    return response;
  }

  response.passed = true;
};

export default checkPublishingRequirements;
