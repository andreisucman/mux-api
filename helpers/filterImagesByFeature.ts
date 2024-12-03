import { ToAnalyzeType } from "@/types.js";
import { TypeEnum } from "@/types.js";

export default function filterImagesByFeature(
  toAnalyzeObjects: ToAnalyzeType[],
  type: TypeEnum,
  feature: string
) {
  let filteredImages = [];

  if (type === "head") {
    if (feature === "mouth") {
      filteredImages = toAnalyzeObjects
        .filter((obj) => obj.position === "mouth")
        .map((obj) => obj.mainUrl.url);
    } else if (feature === "scalp") {
      filteredImages = toAnalyzeObjects
        .filter((obj) => obj.position === "scalp")
        .map((obj) => obj.mainUrl.url);
    } else {
      filteredImages = toAnalyzeObjects
        .filter((obj) => obj.position !== "scalp" && obj.position !== "mouth")
        .map((obj) => obj.mainUrl.url);
    }
  } else {
    if (feature === "chest" || feature === "belly") {
      filteredImages = toAnalyzeObjects
        .filter(
          (obj) =>
            obj.position === "front" ||
            obj.position === "right" ||
            obj.position === "left"
        )
        .map((obj) => obj.mainUrl.url);
    } else if (feature === "back") {
      filteredImages = toAnalyzeObjects
        .filter((obj) => obj.position === "back")
        .map((obj) => obj.mainUrl.url);
    } else {
      filteredImages = toAnalyzeObjects.map((obj) => obj.mainUrl.url);
    }
  }

  return filteredImages;
}
