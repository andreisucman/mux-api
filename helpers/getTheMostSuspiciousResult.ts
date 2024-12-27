import { ModerationResultType } from "@/functions/moderateContent.js";

export default function getTheMostSuspiciousResult(
  moderationResults: ModerationResultType[]
): ModerationResultType {
  const scoresArray = moderationResults.map((rec) =>
    Math.max(...Object.values(rec.scores))
  );
  const highestScore = Math.max(...scoresArray);
  const indexOfHighestResult = scoresArray.indexOf(highestScore);

  return moderationResults[indexOfHighestResult];
}
