import { RoutineType } from "@/types.js";
import { DiaryRecordType } from "@/types/saveDiaryRecordTypes.js";
import { generateRandomPastelColor } from "make-random-color";

export function maskRoutine(routine: RoutineType) {
  return {
    ...routine,
    allTasks: routine.allTasks.map((t) => ({
      ...t,
      icon: "❓",
      name: Array(t.name.length).fill("*").join(""),
      key: Array(t.key.length).fill("*").join(""),
      description: Array(10).fill("*").join("") + "...",
      instruction: Array(15).fill("*").join("") + "...",
      ids: t.ids.map((obj) => ({ ...obj, _id: null })),
    })),
  };
}

export function maskDiaryRow(diaryRecord: DiaryRecordType) {
  return {
    ...diaryRecord,
    audio: "/",
    embedding: [],
    activity: diaryRecord.activity.map((a) => {
      const color1 = generateRandomPastelColor().slice(1);
      const color2 = generateRandomPastelColor().slice(1);

      const thumbnail = `https://placehold.co/480x720/${color1}/${color1}/webp?text=%27&font=poppins`;
      const placeholder =
        a.contentType === "image"
          ? `https://placehold.co/480x720/${color2}/${color2}/webp?text=%27&font=poppins`
          : "https://mux.nyc3.cdn.digitaloceanspaces.com/video.mp4";

      return {
        ...a,
        icon: "❓",
        url: placeholder,
        thumbnail: a.contentType === "video" ? thumbnail : "",
        name: Array(a.name.length).fill("*").join(""),
        contentId: "*",
        taskId: "*",
      };
    }),
  };
}

export function maskProof(diaryRecord: DiaryRecordType) {
  return {
    ...diaryRecord,
    audio: "/",
    embedding: [],
    activity: diaryRecord.activity.map((a) => {
      const color1 = generateRandomPastelColor().slice(1);
      const color2 = generateRandomPastelColor().slice(1);

      const thumbnail = `https://placehold.co/480x720/${color1}/${color1}/webp?text=%27&font=poppins`;
      const placeholder =
        a.contentType === "image"
          ? `https://placehold.co/480x720/${color2}/${color2}/webp?text=%27&font=poppins`
          : "https://mux.nyc3.cdn.digitaloceanspaces.com/video.mp4";

      return {
        ...a,
        icon: "❓",
        url: placeholder,
        thumbnail: a.contentType === "video" ? thumbnail : "",
        name: Array(a.name.length).fill("*").join(""),
        contentId: "*",
        taskId: "*",
      };
    }),
  };
}
