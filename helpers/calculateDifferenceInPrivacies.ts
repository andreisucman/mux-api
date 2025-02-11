import { PrivacyType } from "types.js";

export default function calculateDifferenceInPrivacies(
  oldPrivacy: PrivacyType[],
  newPrivacy: PrivacyType[]
) {
  const oldTypesMap = new Map();
  oldPrivacy.forEach((typePrivacy) => {
    typePrivacy.parts.forEach((partPrivacy) => {
      oldTypesMap.set(partPrivacy.name, partPrivacy.value);
    });
  });

  const different: {
    category: string;
    name: string;
    value: boolean;
    type: string;
  }[] = [];

  newPrivacy.forEach((privacy) => {
    privacy.parts.forEach((partPrivacy) => {
      const oldValue = oldTypesMap.get(partPrivacy.name);

      if (oldValue !== partPrivacy.value) {
        different.push({
          category: privacy.name,
          ...partPrivacy,
          type: privacy.name,
        });
      }
    });
  });

  return different;
}
