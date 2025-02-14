import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import doWithRetries from "helpers/doWithRetries.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import askRepeatedly from "functions/askRepeatedly.js";
import {
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
import { FeatureAnalysisResultType } from "@/types/analyzeFeatureType.js";

type Props = {
  userId: string;
  sex: SexEnum;
  part: PartEnum;
  categoryName: CategoryNameEnum;
  appearanceAnalysisResults: FeatureAnalysisResultType[];
};

export default async function analyzeConcerns({
  sex,
  userId,
  part,
  categoryName,
  appearanceAnalysisResults,
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

    const systemContent = `You are an esthetician, dermatologist, dentist and fitness-coach. The user gives you their appearance analysis. Your goal is to identify which of the concerns from this list: ${concerns.join(
      "\n-"
    )} are mentioned in the analysis. Your response is the name of the relevant concerns from the list and 1 short sentence describing the location of each concern in the 2nd tense (you/your). Example: 'You have minimal signs of puffiness around the eyes'. Think step-by-step. Use only the information provided.`;

    const ConcernsResponseType = z.object({
      concerns: z.array(
        z.object({
          name: z
            .string()
            .describe("name of the relevant concern from the list"),
          explanation: z
            .string()
            .describe(
              "1 short sentence describing the location of the concern in the 2nd tense (you/your)"
            ),
        })
      ),
    });

    const content = appearanceAnalysisResults.map((obj) => ({
      type: "text",
      text: obj.explanation,
    }));

    const userContent = [
      {
        isMini: true,
        content,
        responseFormat: zodResponseFormat(
          ConcernsResponseType,
          "ConcernsResponseType"
        ),
        callback: () =>
          incrementProgress({ userId, operationKey: "progress", value: 3 }),
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
