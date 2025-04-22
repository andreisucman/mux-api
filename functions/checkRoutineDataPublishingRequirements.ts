import doWithRetries from "@/helpers/doWithRetries.js";
import { normalizeString } from "@/helpers/utils.js";
import { db } from "@/init.js";
import { ProgressType } from "@/types.js";
import { ObjectId } from "mongodb";

type Props = {
  userId: string;
  part: string;
  concern: string;
};

const checkPublishingRequirements = async ({ userId, part, concern }: Props) => {
  const response = { passed: false, message: "" };

  const numberOfProgresses = await doWithRetries(() =>
    db.collection("Progress").countDocuments({ userId: new ObjectId(userId), part, concerns: { $in: [concern] } })
  );

  const concernName = normalizeString(concern).toLowerCase();

  if (numberOfProgresses < 2) {
    response.message = `You have to have at least one pair of before-after images for the ${concernName} concern.`;
    return response;
  }

  const earliestConcernScoreRecord = (await doWithRetries(() =>
    db
      .collection("Progress")
      .find({ userId: new ObjectId(userId), part, concerns: { $in: [concern] } })
      .project({ concernScores: 1 })
      .sort({ createdAt: 1 })
      .next()
  )) as unknown as Partial<ProgressType>;

  const { concernScores: firstConcernScoresObject } = earliestConcernScoreRecord;

  const latestConcernScoreRecord = (await doWithRetries(() =>
    db
      .collection("Progress")
      .find({ userId: new ObjectId(userId), part, concerns: { $in: [concern] } })
      .project({ concernScores: 1 })
      .sort({ createdAt: -1 })
      .next()
  )) as unknown as Partial<ProgressType>;

  const { concernScores: lastConcernScoresObject } = latestConcernScoreRecord;
  const relevantFirstConcernScoreObject = firstConcernScoresObject.find((co) => co.name === concern);
  const relevantLastConcernScoreObject = lastConcernScoresObject.find((co) => co.name === concern);

  const improvementTresholdPassed =
    relevantLastConcernScoreObject.value - relevantFirstConcernScoreObject.value <=
    Number(process.env.IMPROVEMENT_RATE_TRESHOLD) * -1;

  if (improvementTresholdPassed) {
    response.message = `You have to have at least ${Number(
      process.env.IMPROVEMENT_RATE_TRESHOLD
    )} points of improvement between your before-after images for the ${concernName} concern.`;
    return response;
  }

  response.passed = true;
};

export default checkPublishingRequirements;
