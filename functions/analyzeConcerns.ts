import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import doWithRetries from "helpers/doWithRetries.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import askRepeatedly from "functions/askRepeatedly.js";
import {
  ToAnalyzeType,
  SexEnum,
  PartEnum,
  ConcernType,
  UserConcernType,
  CategoryNameEnum,
} from "types.js";
import { db } from "init.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import httpError from "@/helpers/httpError.js";
import updateConcernsAnalytics from "./updateConcernsAnalytics.js";
import { urlToBase64 } from "@/helpers/utils.js";

type Props = {
  userId: string;
  sex: SexEnum;
  part: PartEnum;
  categoryName: CategoryNameEnum;
  toAnalyze: ToAnalyzeType[];
};

export default async function analyzeConcerns({
  sex,
  userId,
  part,
  categoryName,
  toAnalyze,
}: Props) {
  try {
    const concernObjects = (await doWithRetries(async () =>
      db
        .collection("Concern")
        .find(
          {
            parts: { $in: [part] },
            $or: [{ sex }, { sex: "all" }],
          },
          { projection: { _id: 0, name: 1 } }
        )
        .toArray()
    )) as unknown as ConcernType[];

    const concerns = concernObjects.map((obj) => obj.name);

    const systemContent = `You are an esthetician, dermatologist, dentist and fitness-coach. The user gives you their images. Your goal is to identify which of the concerns from this list: ${concerns.join(
      "\n-"
    )} are clearly visible on the images. Your response is the name of the relevant concerns from the list and 1 sentence description for each in the 2nd tense (you/your) describing where it is present on the user's photos. Think step-by-step. Use only the information provided.`;

    const ConcernsResponseType = z.object({
      concerns: z
        .array(
          z.object({
            name: z
              .string()
              .describe("name of the relevant concern from the list"),
            explanation: z
              .string()
              .describe(
                "1 sentence description of the concern and the explanation of where it was identified on the user's photo, in the 2nd tense (you/your)"
              ),
          })
        )
        .describe(""),
    });

    const images = [];

    for (const obj of toAnalyze) {
      images.push({
        type: "image_url",
        image_url: {
          url: await urlToBase64(obj.mainUrl.url),
          detail: "high",
        },
      });
    }

    const userContent = [
      {
        isMini: false,
        content: images,
        responseFormat: zodResponseFormat(
          ConcernsResponseType,
          "ConcernsResponseType"
        ),
        callback: () =>
          incrementProgress({ userId, operationKey: "progress", increment: 3 }),
      },
    ];

    const response: { concerns: { name: string; explanation: string }[] } =
      await askRepeatedly({
        userId,
        systemContent,
        runs: userContent as RunType[],
        functionName: "analyzeConcerns",
        categoryName,
      });

    const combined: UserConcernType[] = response.concerns.map(
      (concern: { name: string; explanation: string }, index: number) => ({
        ...concern,
        part,
        importance: index + 1,
        isDisabled: false,
      })
    );

    updateConcernsAnalytics({ userId, concerns: combined });

    return combined;
  } catch (err) {
    httpError(err);
  }
}
