import * as dotenv from "dotenv";
import askRepeatedly from "./askRepeatedly.js";
import { PartEnum, CategoryNameEnum } from "types.js";
import { ScoreType } from "types.js";
import httpError from "@/helpers/httpError.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { normalizeString } from "@/helpers/utils.js";

dotenv.config();

type Props = {
  userId: string;
  part: PartEnum;
  latestTasksMap?: { [name: string]: number };
  concernScores: ScoreType[];
  specialConsiderations?: string;
  previousExperience: { [key: string]: string };
  categoryName: CategoryNameEnum;
};

export default async function createRoutineSuggestionQuestions({
  part,
  latestTasksMap,
  previousExperience,
  specialConsiderations,
  concernScores,
  categoryName,
  userId,
}: Props) {
  try {
    const nonZeroPartConcernScores = concernScores.filter((so) => so.value > 0);
    const concernsAndSeverities = nonZeroPartConcernScores
      .map((co) => `Name: ${co.name}. Severity: ${co.value}. Explanation: ${co.explanation}.`)
      .join("\n");

    let systemContent = `You are a dermatologist and fitness coach. Your patient has the following concerns for their ${part}: ###${concernsAndSeverities}###. Check their information and come up with questions to discover important missing information for creating an effective routine for improving their concerns. Not more than 5 questions. Use only the information available. Your response is a JSON object with this structure: { questionsForTheUser: string[]}`;

    const previousExperienceString = Object.entries(previousExperience)
      .map(([concern, explanation]) => `${normalizeString(concern)}: ${explanation}`)
      .join("\n");

    let text;

    if (previousExperienceString) text += `\n\nHere is my experience: ${previousExperienceString}.`;
    if (latestTasksMap) text += `\n\nThe tasks I've completed within the last week: ${JSON.stringify(latestTasksMap)}.`;
    if (specialConsiderations) text += `\n\nMy special considerations: ${specialConsiderations}.`;

    const runs: RunType[] = [
      {
        model: "deepseek-chat",
        content: [{ type: "text", text: text || "no information" }],
        responseFormat: { type: "json_object" },
      },
    ];

    const response = await askRepeatedly({
      runs,
      userId,
      systemContent,
      categoryName,
      functionName: "createRoutineSuggestionQuestion",
    });

    return response.questionsForTheUser;
  } catch (err) {
    throw httpError(err);
  }
}
