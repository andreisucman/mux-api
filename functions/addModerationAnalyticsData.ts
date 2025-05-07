import * as dotenv from "dotenv";
dotenv.config();

import httpError from "@/helpers/httpError.js";
import { ModerationResultType } from "./moderateContent.js";
import getModerationLabelsOverThreshold from "@/helpers/getModerationLabelsOverThreshold.js";
import updateAnalytics from "./updateAnalytics.js";
import { CategoryNameEnum } from "@/types.js";

type Props = {
  categoryName: CategoryNameEnum;
  moderationResults: ModerationResultType[];
  isSuspicious: boolean;
  isSafe: boolean;
  userId: string;
  userType: "user" | "client";
};

export default async function addModerationAnalyticsData({
  categoryName,
  moderationResults,
  isSuspicious,
  isSafe,
  userId,
  userType,
}: Props) {
  try {
    let analyticIncrementPayload: {
      [key: string]: number;
    } = {
      [`overview.${userType}.moderation.totalUploaded`]: 1,
    };

    analyticIncrementPayload[`overview.${userType}.moderation.uploaded.${categoryName}`] = 1;

    if (!isSafe) {
      analyticIncrementPayload[`overview.${userType}.moderation.totalBlocked`] = 1;
      analyticIncrementPayload[`overview.${userType}.moderation.blocked.${categoryName}`] = 1;

      const blockedReasons = getModerationLabelsOverThreshold({
        moderationResults,
        upperBoundary: Number(process.env.MODERATION_UPPER_BOUNDARY),
        key: `overview.${userType}.moderation.blockedReasons`,
      });

      analyticIncrementPayload = { ...blockedReasons };
    } else {
      if (isSuspicious) {
        analyticIncrementPayload[`overview.${userType}.moderation.totalSuspicious`] = 1;
        analyticIncrementPayload[`overview.${userType}.moderation.suspicious.${categoryName}`] = 1;

        const suspiciousReasons = getModerationLabelsOverThreshold({
          moderationResults,
          upperBoundary: Number(process.env.MODERATION_UPPER_BOUNDARY),
          lowerBoundary: Number(process.env.MODERATION_LOWER_BOUNDARY),
          key: `overview.${userType}.moderation.suspiciousReasons`,
        });

        analyticIncrementPayload = { ...suspiciousReasons };
      }
    }

    updateAnalytics({
      userId,
      incrementPayload: analyticIncrementPayload,
    });
  } catch (err) {
    throw httpError(err);
  }
}
