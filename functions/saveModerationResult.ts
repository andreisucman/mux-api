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
  isSuspicious: boolean;
  isSafe: boolean;
  moderationResults: ModerationResultType[];
};

export default async function saveModerationResult({
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
      "dashboard.content.totalUploaded": 1,
    };

    analyticIncrementPayload[`dashboard.content.uploaded.${categoryName}`] = 1;

    if (!isSafe) {
      analyticIncrementPayload[`dashboard.content.blocked.${categoryName}`] = 1;

      const blockedReasons = getModerationLabelsOverThreshold({
        moderationResults,
        upperBoundary: Number(process.env.MODERATION_UPPER_BOUNDARY),
        key: "dashboard.content.blockedReasons",
      });

      analyticIncrementPayload = { ...blockedReasons };
    } else {
      if (isSuspicious) {
        analyticIncrementPayload[
          `dashboard.content.suspicious.${categoryName}`
        ] = 1;

        const suspiciousReasons = getModerationLabelsOverThreshold({
          moderationResults,
          upperBoundary: Number(process.env.MODERATION_UPPER_BOUNDARY),
          lowerBoundary: Number(process.env.MODERATION_LOWER_BOUNDARY),
          key: "dashboard.content.suspiciousReasons",
        });

        analyticIncrementPayload = { ...suspiciousReasons };
      }
    }

    updateAnalytics({ userId, incrementPayload: analyticIncrementPayload });
  } catch (err) {
    throw httpError(err);
  }
}
