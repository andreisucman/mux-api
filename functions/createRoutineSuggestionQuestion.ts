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
  partConcernScores: ScoreType[];
  previousExperience: { [key: string]: string };
  categoryName: CategoryNameEnum;
};

export default async function createRoutineSuggestionQuestions({
  part,
  previousExperience,
  partConcernScores,
  categoryName,
  userId,
}: Props) {
  try {
    const nonZeroPartConcernScores = partConcernScores.filter((so) => so.value > 0);
    const concernsAndSeverities = nonZeroPartConcernScores
      .map((co) => `Name: ${co.name}. Severity: ${co.value}. Explanation: ${co.explanation}.`)
      .join("\n");

    let systemContent = `You are a dermatologist. Your patient has the following concerns for their ${part}: ###${concernsAndSeverities}###. Check their past experience and come up with up to 3 questions to discover important missing information for creating an effective routine for improving their concerns. Use only the information available. Don't ask questions about other concerns that are not present. Your response is a JSON object with this structure: { questionsForTheUser: string[]}`;

    const previousExperienceString = Object.entries(previousExperience)
      .map(([concern, explanation]) => `${normalizeString(concern)}: ${explanation}`)
      .join("\n");

    const runs: RunType[] = [
      {
        model: "deepseek-chat",
        content: [{ type: "text", text: `Here is what I: ${previousExperienceString}` }],
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
