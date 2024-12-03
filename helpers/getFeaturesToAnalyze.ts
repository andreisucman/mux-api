import { PartEnum, SexEnum, TypeEnum } from "types.js";

type Props = {
  type: TypeEnum;
  sex: SexEnum;
  part: PartEnum;
};

export default function getFeaturesToAnalyze({ type, part, sex }: Props) {
  if (type === "head") {
    if (part === "face") {
      return ["lips", "grooming", "eyes", "skin"];
    }
    if (part === "mouth") {
      return ["mouth"];
    }
    if (part === "scalp") {
      return ["scalp"];
    }
  } else if (type === "body") {
    if (sex === "male") {
      return ["back", "legs", "arms", "chest", "belly", "shoulders"];
    } else {
      return ["back", "hips", "thighs", "arms", "belly", "calves"];
    }
  }
}
