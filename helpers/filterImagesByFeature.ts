import { ToAnalyzeType } from "@/types.js";

export default function filterImagesByFeature(
  toAnalyzeObjects: ToAnalyzeType[],
  feature: string
) {
  let filteredImages = [];

  if (feature === "mouth") {
    filteredImages = toAnalyzeObjects
      .filter((obj) => obj.part === "mouth" && obj.position === "front")
      .map((obj) => obj.mainUrl.url);
  } else if (feature === "scalp") {
    filteredImages = toAnalyzeObjects
      .filter((obj) => obj.part === "scalp" && obj.position === "front")
      .map((obj) => obj.mainUrl.url);
  } else if (feature === "chest" || feature === "belly") {
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

  return filteredImages;
}
