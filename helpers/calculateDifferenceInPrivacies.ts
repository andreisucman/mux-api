import { PrivacyType } from "types.js";

export default function calculateDifferenceInPrivacies(
  oldPrivacy: PrivacyType[],
  newPrivacy: PrivacyType[]
) {
  const different: {
    category: string;
    name: string;
    value: boolean;
  }[] = [];
  
  const oldTypesMap = new Map();
  oldPrivacy.forEach((categoryPrivacy) => {
    categoryPrivacy.parts.forEach((partPrivacy) => {
      const key = `${categoryPrivacy.name}:${partPrivacy.name}`;
      oldTypesMap.set(key, partPrivacy.value);
    });
  });

  newPrivacy.forEach((privacy) => {
    privacy.parts.forEach((partPrivacy) => {
      const key = `${privacy.name}:${partPrivacy.name}`;
      const oldValue = oldTypesMap.get(key);
      if (oldValue !== partPrivacy.value) {
        different.push({
          category: privacy.name,
          ...partPrivacy,
        });
      }
    });
  });

  return different;
}
