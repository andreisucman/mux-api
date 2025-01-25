import { LatestScoresType, PrivacyType } from "types.js";

type Props = {
  privacy: PrivacyType[];
  latestScoresDifference: LatestScoresType;
};

export default function getScoreDifference({
  privacy,
  latestScoresDifference,
}: Props) {
  let latestHeadScoreDifference = 0;
  let latestBodyScoreDifference = 0;

  if (privacy) {
    const progressPrivacy = privacy.find((pr) => pr.name === "progress");

    const headPrivacy = progressPrivacy.types.find(
      (pt: PrivacyType) => pt.name === "head"
    );

    if (headPrivacy.value) {
      latestHeadScoreDifference = latestScoresDifference?.head?.overall;
    }

    const bodyPrivacy = progressPrivacy.types.find(
      (pt: PrivacyType) => pt.name === "body"
    );

    if (bodyPrivacy.value) {
      latestBodyScoreDifference = latestScoresDifference?.body?.overall;
    }
  }

  return { latestHeadScoreDifference, latestBodyScoreDifference };
}
