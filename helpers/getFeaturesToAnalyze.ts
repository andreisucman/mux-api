import { PartEnum, SexEnum } from "types.js";

type Props = {
  sex: SexEnum;
  part: PartEnum;
};

export default function getFeaturesToAnalyze({ part, sex }: Props) {
  if (part === "face") {
    return ["lips", "grooming", "eyes", "skin"];
  }
  if (part === "mouth") {
    return ["mouth"];
  }
  if (part === "scalp") {
    return ["scalp"];
  }

  if (part === "body") {
    if (sex === "male") {
      return ["back", "legs", "arms", "chest", "belly", "shoulders"];
    } else {
      return ["back", "hips", "thighs", "arms", "belly", "calves"];
    }
  }
}
