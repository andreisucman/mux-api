import { PrivacyType } from "types.js";

export default function calculateDifferenceInPrivacies(
  oldPrivacy: PrivacyType[],
  newPrivacy: PrivacyType[]
) {
  const oldTypesMap = new Map();
  oldPrivacy.forEach((typePrivacy) => {
    typePrivacy.types.forEach((typePrivacy) => {
      oldTypesMap.set(typePrivacy.name, typePrivacy.value);
    });
  });

  const different: {
    category: string;
    name: string;
    value: boolean;
    type: string;
  }[] = [];

  newPrivacy.forEach((privacy) => {
    privacy.types.forEach((typePrivacy) => {
      const oldValue = oldTypesMap.get(typePrivacy.name);

      if (oldValue !== typePrivacy.value) {
        different.push({
          category: privacy.name,
          ...typePrivacy,
          type: privacy.name,
        });
      }
    });
  });

  return different;
}
