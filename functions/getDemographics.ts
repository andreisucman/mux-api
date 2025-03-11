import z from "zod";
import askRepeatedly from "functions/askRepeatedly.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { ToAnalyzeType, DemographicsType, CategoryNameEnum } from "types.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import httpError from "@/helpers/httpError.js";
import updateAnalytics from "./updateAnalytics.js";
import { urlToBase64 } from "@/helpers/utils.js";

type Props = {
  toAnalyze: ToAnalyzeType[];
  userId: string;
  categoryName: CategoryNameEnum;
  demographicsKeys: string[];
};

const demographicsMap = {
  sex: z.enum(["male", "female"]),
  ageInterval: z.enum([
    "18-24",
    "24-30",
    "30-36",
    "36-42",
    "42-48",
    "48-56",
    "56-64",
    "64+",
  ]),
  ethnicity: z.enum([
    "white",
    "asian",
    "black",
    "hispanic",
    "arab",
    "south_asian",
    "native_american",
  ]),
  skinType: z.enum(["dry", "oily", "normal"]),
  bodyType: z.enum(["ectomorph", "mesomorph", "endomorph"]),
};

export default async function getDemographics({
  toAnalyze,
  userId,
  categoryName,
  demographicsKeys,
}: Props) {
  const hasBody = toAnalyze.some((obj) => obj.part === "body");

  try {
    let systemContent =
      "You are an anthropologist. You are given images of a human. Your goal is to determine its demographic data such as sex, age interval, ethnicity, skin type";

    if (hasBody) {
      systemContent += ` and body type.`;
    }

    systemContent += ` Think step-by-step. Follow the instruction strictly. Use only the information that exists.`;

    let demographicsResponseContent = {};

    for (const key of demographicsKeys) {
      demographicsResponseContent[key] = demographicsMap[key];
    }

    const DemographicsResponseType = z.object(demographicsResponseContent);

    const images = [];

    for (const obj of toAnalyze) {
      images.push({
        type: "image_url",
        image_url: {
          url: await urlToBase64(obj.mainUrl.url),
          detail: "low",
        },
      });
    }

    const runs = [
      {
        model: "gpt-4o",
        content: images,
        responseFormat: zodResponseFormat(
          DemographicsResponseType,
          "demographics"
        ),
      },
    ];

    const response: DemographicsType = await askRepeatedly({
      userId,
      systemContent,
      categoryName,
      runs: runs as RunType[],
      functionName: "getDemographics",
    });

    const analyticsPayload: { [key: string]: number } = {};

    const { sex, ethnicity, skinType, ageInterval, bodyType } = response;

    if (sex) {
      analyticsPayload[`overview.demographics.sex.${sex}`] = 1;
    }

    if (ethnicity) {
      analyticsPayload[`overview.demographics.ethnicity.${ethnicity}`] = 1;
    }

    if (skinType) {
      analyticsPayload[`overview.demographics.skinType.${skinType}`] = 1;
    }

    if (ageInterval) {
      analyticsPayload[`overview.demographics.ageInterval.${ageInterval}`] = 1;
    }

    if (bodyType) {
      analyticsPayload[`overview.demographics.bodyType.${bodyType}`] = 1;
    }

    updateAnalytics({
      userId: String(userId),
      incrementPayload: analyticsPayload,
    });

    return response;
  } catch (err) {
    throw httpError(err);
  }
}
