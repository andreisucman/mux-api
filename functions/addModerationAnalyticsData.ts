import * as dotenv from "dotenv";
dotenv.config();

import httpError from "@/helpers/httpError.js";
import { ModerationResultType } from "./moderateContent.js";
import getModerationLabelsOverThreshold from "@/helpers/getModerationLabelsOverThreshold.js";
import updateAnalytics from "./updateAnalytics.js";
import { CategoryNameEnum } from "@/types.js";

type Props = {
  userId: string;
  categoryName: CategoryNameEnum;
  moderationResults: ModerationResultType[];
  isSuspicious: boolean;
  isSafe: boolean;
};

export default async function addModerationAnalyticsData({
  categoryName,
  moderationResults,
  isSuspicious,
  isSafe,
  userId,
}: Props) {
  try {
    let analyticIncrementPayload: {
      [key: string]: number;
    } = {
      "overview.moderation.totalUploaded": 1,
    };

    analyticIncrementPayload[
      `overview.moderation.uploaded.${categoryName}`
    ] = 1;

    if (!isSafe) {
      analyticIncrementPayload[
        `overview.moderation.blocked.${categoryName}`
      ] = 1;

      const blockedReasons = getModerationLabelsOverThreshold({
        moderationResults,
        upperBoundary: Number(process.env.MODERATION_UPPER_BOUNDARY),
        key: "overview.moderation.blockedReasons",
      });

      analyticIncrementPayload = { ...blockedReasons };
    } else {
      if (isSuspicious) {
        analyticIncrementPayload[
          `overview.moderation.suspicious.${categoryName}`
        ] = 1;

        const suspiciousReasons = getModerationLabelsOverThreshold({
          moderationResults,
          upperBoundary: Number(process.env.MODERATION_UPPER_BOUNDARY),
          lowerBoundary: Number(process.env.MODERATION_LOWER_BOUNDARY),
          key: "overview.moderation.suspiciousReasons",
        });

        analyticIncrementPayload = { ...suspiciousReasons };
      }
    }

    updateAnalytics(analyticIncrementPayload);
  } catch (err) {
    throw httpError(err);
  }
}
