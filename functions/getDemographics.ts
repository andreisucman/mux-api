import z from "zod";
import askRepeatedly from "functions/askRepeatedly.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { ToAnalyzeType, DemographicsType, TypeEnum, CategoryNameEnum } from "types.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  toAnalyzeObjects: ToAnalyzeType[];
  userId: string;
  type: TypeEnum;
  categoryName: CategoryNameEnum;
};

export default async function getDemographics({
  toAnalyzeObjects,
  userId,
  type,
  categoryName,
}: Props) {
  let systemContent = "";

  if (type === "head") {
    systemContent += `You are an anthropologist. You are given images of a human. Your goal is to determine its demographic data such as sex, age interval, ethnicity,  and skin type.`;
  } else {
    systemContent += `You are an anthropologist. You are given images of a human. Your goal is to determine its body type.`;
  }

  systemContent += `Think step-by-step. Follow the instruction strictly. Use only the information that exists.`;

  let DemographicsResponseType = null;

  if (type === "head") {
    DemographicsResponseType = z.object({
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
    });
  }

  if (type === "body") {
    DemographicsResponseType = z.object({
      bodyType: z.enum(["ectomorph", "mesomorph", "endomorph"]),
    });
  }

  const runs = [
    {
      isMini: false,
      content: [
        ...toAnalyzeObjects.map((object) => ({
          type: "image_url",
          image_url: {
            url: object.mainUrl.url,
            detail: "low",
          },
        })),
      ],
      responseFormat: zodResponseFormat(
        DemographicsResponseType,
        "demographics"
      ),
    },
  ];

  try {
    const response: DemographicsType = await askRepeatedly({
      userId,
      systemContent,
      categoryName,
      runs: runs as RunType[],
      functionName: "getDemographics",
    });
    return response;
  } catch (err) {
    throw httpError(err);
  }
}
