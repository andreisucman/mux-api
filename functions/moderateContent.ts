import * as dotenv from "dotenv";
dotenv.config();

import { openai } from "@/init.js";
import {
  Moderation,
  ModerationImageURLInput,
  ModerationTextInput,
} from "openai/resources/moderations.mjs";
import httpError from "@/helpers/httpError.js";
import doWithRetries from "@/helpers/doWithRetries.js";

export type ModerationResultType = {
  type: "text" | "image_url";
  content: string;
  scores: Moderation.CategoryScores;
};

type Props = {
  content: ModerationTextInput[] | ModerationImageURLInput[];
};

export default async function moderateContent({ content }: Props) {
  try {
    const moderation = await doWithRetries(async () =>
      openai.moderations.create({
        model: "omni-moderation-latest",
        input: content,
      })
    );

    const { results } = moderation;

    let isSafe = true;
    let isSuspicious = false;
    const suspiciousAnalysisResults: ModerationResultType[] = [];

    for (let i = 0; i < results.length; i++) {
      const { category_scores } = results[i];
      const values = Object.values(category_scores);

      for (const value of values) {
        if (value >= Number(process.env.MODERATION_UPPER_BOUNDARY)) {
          isSafe = false;
        }

        isSuspicious =
          value >= Number(process.env.MODERATION_LOWER_BOUNDARY) &&
          value < Number(process.env.MODERATION_UPPER_BOUNDARY);

        if (isSuspicious) {
          if (content[i].type === "text") {
            suspiciousAnalysisResults.push({
              type: content[i].type,
              content: (content[i] as ModerationTextInput).text,
              scores: results[i].category_scores,
            });
          } else {
            suspiciousAnalysisResults.push({
              type: content[i].type,
              content: (content[i] as ModerationImageURLInput).image_url.url,
              scores: results[i].category_scores,
            });
          }
        }
      }
    }

    return { isSafe, isSuspicious, suspiciousAnalysisResults };
  } catch (err) {
    throw httpError(err);
  }
}
