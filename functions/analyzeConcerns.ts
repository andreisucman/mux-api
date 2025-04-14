import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import doWithRetries from "helpers/doWithRetries.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import askRepeatedly from "functions/askRepeatedly.js";
import { PartEnum, ConcernType, CategoryNameEnum } from "types.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import httpError from "@/helpers/httpError.js";
import updateConcernsAnalytics from "./updateConcernsAnalytics.js";
import { urlToBase64 } from "@/helpers/utils.js";
import { db } from "init.js";

type Props = {
  userId: string;
  part: PartEnum;
  currentImages: string[];
  categoryName: CategoryNameEnum;
};

export default async function analyzeConcerns({ userId, part, currentImages, categoryName }: Props) {
  try {
    const concernObjects = (await doWithRetries(async () =>
      db
        .collection("Concern")
        .find(
          {
            parts: { $in: [part] },
          },
          { projection: { _id: 0, name: 1 } }
        )
        .toArray()
    )) as unknown as ConcernType[];

    const concerns = concernObjects.map((obj) => obj.name);
    const listOfConcerns = concerns.join("\n-");

    const systemContent = `You are a dermatologist. You're given the images of a person. Your goal is to identify which of the concerns from following list are present on the person. List of concerns: ${listOfConcerns}. Think step-by-step. Don't make assumptions, use only the information provided.`;

    const ConcernsResponseType = z.object({
      concerns: z.array(z.string()).describe("array of concerns from the list that are clearly present on the image"),
    });

    const images = await Promise.all(
      currentImages.map(async (image) => ({
        type: "image_url" as "image_url",
        image_url: { url: await urlToBase64(image), detail: "low" as "low" },
      }))
    );

    const userContent: RunType[] = [
      {
        model: "gpt-4o",
        content: [
          {
            type: "text",
            text: "What concern from the list are clearly present on this person?",
          },
          ...images,
        ],
        callback: () => incrementProgress({ userId, operationKey: "progress", value: 3 }),
        responseFormat: zodResponseFormat(ConcernsResponseType, "ConcernsResponseType"),
      },
    ];

    const response: { concerns: string[] } = await askRepeatedly({
      userId,
      systemContent,
      runs: userContent as RunType[],
      functionName: "analyzeConcerns",
      categoryName,
    });

    const userConcerns = response.concerns.map((string) => ({
      name: string,
      part,
    }));

    updateConcernsAnalytics({ userId, concerns: userConcerns });

    return userConcerns;
  } catch (err) {
    httpError(err);
  }
}
