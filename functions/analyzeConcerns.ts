import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import doWithRetries from "helpers/doWithRetries.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import askRepeatedly from "functions/askRepeatedly.js";
import {
  ToAnalyzeType,
  TypeEnum,
  SexEnum,
  PartEnum,
  ConcernType,
  UserConcernType,
} from "types.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  sex: SexEnum;
  part: PartEnum;
  type: TypeEnum;
  toAnalyzeObjects: ToAnalyzeType[];
};

export default async function analyzeConcerns({
  sex,
  type,
  userId,
  part,
  toAnalyzeObjects,
}: Props) {
  try {
    const concernsObjects = (await doWithRetries(async () =>
      db
        .collection("Concern")
        .find(
          {
            types: { $in: [type] },
            parts: { $in: [part] },
            $or: [{ sex }, { sex: "all" }],
          },
          { projection: { key: 1 } }
        )
        .toArray()
    )) as unknown as ConcernType[];

    const concerns = concernsObjects.map((obj) => obj.key);

    const systemContent = `You are a ${
      type === "head"
        ? "esthetician-dermatologist-dentist"
        : "dermatologist and fitness-coach"
    }. The user gives you their images. Your goal is to identify which of the concerns from this list: ${
      type === "head"
        ? "-" + concerns.join("\n-")
        : sex === "male"
        ? "-" + concerns.join("\n-")
        : "-" + concerns.join("\n-")
    } are clearly visible on the images. Your response is the name of the concerns and 1 sentence description for each in the 2nd tense (you/your) describing where it is present on the user's photos. Name is the name of the identified concern as it is written in the list. Explanation is your 1 sentence reasoning for choosing this concern in the 2nd tense (you/your). Think step-by-step. Use only the information provided.`;

    const ConcernsResponseType = z.object({
      concerns: z.array(
        z.object({ name: z.string(), explanation: z.string() })
      ),
    });

    const userContent = [
      {
        isMini: false,
        content: toAnalyzeObjects.map((object) => ({
          type: "image_url",
          image_url: {
            url: object.mainUrl.url,
            detail: "high",
          },
        })),
        responseFormat: zodResponseFormat(
          ConcernsResponseType,
          "concerns_response_type"
        ),
        callback: () => incrementProgress({ userId, operationKey: type, increment: 3 }),
      },
    ];

    const response: { concerns: { name: string; explanation: string }[] } =
      await askRepeatedly({
        systemContent,
        runs: userContent as RunType[],
        userId,
      });

    const combined: UserConcernType[] = response.concerns.map(
      (concern: { name: string; explanation: string }, index: number) => ({
        ...concern,
        part,
        importance: index + 1,
        isDisabled: false,
        type,
      })
    );

    return combined;
  } catch (err) {
    httpError(err);
  }
}
