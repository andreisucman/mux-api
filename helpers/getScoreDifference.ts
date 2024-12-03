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
    const headPrivacy = privacy.find(
      (typePrivacyObj: PrivacyType) => typePrivacyObj.name === "head"
    );

    if (headPrivacy) {
      const someHeadPrivacyEnabled = headPrivacy.parts.some(
        (partObj: { value: boolean }) => partObj.value
      );

      if (someHeadPrivacyEnabled) {
        latestHeadScoreDifference = latestScoresDifference?.head?.overall;
      }
    }

    const bodyPrivacy = privacy.find(
      (typePrivacyObj: PrivacyType) => typePrivacyObj.name === "body"
    );

    if (bodyPrivacy) {
      const someBodyPrivacyEnabled = bodyPrivacy.parts.some(
        (partObj: { value: boolean }) => partObj.value
      );

      if (someBodyPrivacyEnabled) {
        latestBodyScoreDifference = latestScoresDifference?.body?.overall;
      }
    }
  }

  return { latestHeadScoreDifference, latestBodyScoreDifference };
}
