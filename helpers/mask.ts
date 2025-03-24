import { ProofType, RoutineType } from "@/types.js";
import { DiaryRecordType } from "@/types/saveDiaryRecordTypes.js";

export function maskRoutine(routine: RoutineType) {
  return {
    ...routine,
    _id: null,
    userId: null,
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
    _id: null,
    userId: null,
    audio: "/",
    embedding: [],
    activity: diaryRecord.activity.map((a) => {
      const thumbnail = `https://placehold.co/480x720/3b3b3b/3b3b3b/webp?text=%27&font=poppins`;
      const placeholder =
        a.contentType === "image"
          ? `https://placehold.co/480x720/3b3b3b/3b3b3b/webp?text=%27&font=poppins`
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

export function maskProof(proof: ProofType) {
  const thumbnail = `https://placehold.co/480x720/3b3b3b/3b3b3b/webp?text=%27&font=poppins`;
  const placeholder =
    proof.contentType === "image"
      ? `https://placehold.co/480x720/3b3b3b/3b3b3b/webp?text=%27&font=poppins`
      : "https://mux.nyc3.cdn.digitaloceanspaces.com/video.mp4";
  return {
    ...proof,
    _id: null,
    userId: null,
    taskKey: Array(proof.taskKey.length).fill("*").join(""),
    taskName: Array(proof.taskName.length).fill("*").join(""),
    requisite: Array(proof.requisite.length).fill("*").join(""),
    mainUrl: { name: "", url: placeholder },
    mainThumbnail:
      proof.contentType === "image" ? null : { name: "", url: thumbnail },
    icon: "❓",
    concern: Array(proof.concern.length).fill("*").join(""),
  };
}
