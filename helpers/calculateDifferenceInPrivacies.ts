import { PrivacyType } from "types.js";

export default function calculateDifferenceInPrivacies(
  oldPrivacy: PrivacyType[],
  newPrivacy: PrivacyType[]
) {
  try {
    const oldPartsMap = new Map();
    oldPrivacy.forEach((typePrivacy) => {
      typePrivacy.parts.forEach((partPrivacy) => {
        oldPartsMap.set(partPrivacy.name, partPrivacy.value);
      });
    });

    const different: { name: string; value: boolean; type: string }[] = [];

    newPrivacy.forEach((typePrivacy) => {
      typePrivacy.parts.forEach((partPrivacy) => {
        const oldValue = oldPartsMap.get(partPrivacy.name);

        if (oldValue !== partPrivacy.value) {
          different.push({ ...partPrivacy, type: typePrivacy.name });
        }
      });
    });

    return different;
  } catch (err) {
    console.log("Error in calculateDifferenceInPrivacies: ", err);
    return [];
  }
}
