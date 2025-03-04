type ImageObject = {
  position: string;
  part: string;
  url: string;
}

export default function filterImagesByFeature(
  toAnalyzeObjects: ImageObject[],
  feature: string
) {
  let filteredImages: ImageObject[] = [];

  if (feature === "mouth") {
    filteredImages = toAnalyzeObjects.filter(
      (obj) => obj.part === "mouth" && obj.position === "front"
    );
  } else if (feature === "scalp") {
    filteredImages = toAnalyzeObjects.filter(
      (obj) => obj.part === "scalp" && obj.position === "front"
    );
  } else if (feature === "chest" || feature === "belly") {
    filteredImages = toAnalyzeObjects.filter(
      (obj) =>
        obj.position === "front" ||
        obj.position === "right" ||
        obj.position === "left"
    );
  } else if (feature === "back") {
    filteredImages = toAnalyzeObjects.filter((obj) => obj.position === "back");
  } else {
    filteredImages = toAnalyzeObjects;
  }

  return filteredImages;
}
