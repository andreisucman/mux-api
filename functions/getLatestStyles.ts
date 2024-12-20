import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import { StyleAnalysisType } from "types.js";
import { ContentModerationStatusEnum } from "types.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
};

export default async function getLatestStyles({ userId }: Props) {
  try {
    const styles = await doWithRetries(
      async () =>
        await db
          .collection("StyleAnalysis")
          .aggregate([
            {
              $match: {
                userId: new ObjectId(userId),
                moderationStatus: ContentModerationStatusEnum.ACTIVE,
              },
            },
            { $sort: { createdAt: -1 } },
            {
              $group: {
                _id: "$type",
                tempId: { $first: "$_id" },
                type: { $first: "$type" },
                demographics: { $first: "$demographics" },
                goals: { $first: "$goals" },
                scores: { $first: "$scores" },
                createdAt: { $first: "$createdAt" },
                currentDescription: { $first: "$currentDescription" },
                currentSuggestion: { $first: "$currentSuggestion" },
                matchSuggestion: { $first: "$matchSuggestion" },
                latestStyleAnalysis: { $first: "$latestStyleAnalysis" },
                image: { $first: "$image" },
                styleName: { $first: "$styleName" },
              },
            },
            {
              $project: {
                _id: "$tempId",
                type: 1,
                demographics: 1,
                goals: 1,
                scores: 1,
                createdAt: 1,
                currentDescription: 1,
                currentSuggestion: 1,
                matchSuggestion: 1,
                latestStyleAnalysis: 1,
                image: 1,
                styleName: 1,
              },
            },
          ])
          .toArray()
    );

    if (!styles || styles.length === 0) {
      return { head: {} as StyleAnalysisType, body: {} as StyleAnalysisType };
    }

    const headStyle = styles.find((style) => style.type === "head");
    const bodyStyle = styles.find((style) => style.type === "body");

    return { head: headStyle, body: bodyStyle };
  } catch (err) {
    throw httpError(err);
  }
}
