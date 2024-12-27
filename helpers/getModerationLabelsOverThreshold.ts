import { ModerationResultType } from "@/functions/moderateContent.js";

type Props = {
  moderationResults: ModerationResultType[];
  lowerBoundary?: number;
  upperBoundary?: number;
  key: string;
};

export default function getModerationLabelsOverThreshold({
  moderationResults,
  lowerBoundary,
  upperBoundary,
  key,
}: Props) {
  const output: { [key: string]: number } = {};

  for (const result of moderationResults) {
    for (const [label, value] of Object.entries(result.scores)) {
      if (upperBoundary && !lowerBoundary) {
        // for blocked
        if (value >= upperBoundary) {
          output[`${key}.${label}`] = 1;
        }
      } else if (upperBoundary && lowerBoundary) {
        // for suspicious
        if (value >= lowerBoundary && value < upperBoundary) {
          output[`${key}.${label}`] = 1;
        }
      }
    }
  }

  return output;
}
