import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import askRepeatedly from "functions/askRepeatedly.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import httpError from "@/helpers/httpError.js";
import getUserInfo from "./getUserInfo.js";

type Props = {
  text: string;
  userId: string;
};

export default async function moderateDescription({ userId, text }: Props) {
  try {
    const userInfo = await getUserInfo({
      userId,
      projection: { specialConsiderations: 1 },
    });

    const { specialConsiderations } = userInfo;

    const systemContent = `The user gives you a description of an activity. Your goal is to check if it has an intent of harming the person who performs it. An activity has an intent of harming when it usually leads to health damage or is related to sexual intercourse. Return true if harmful, and false if not.`;

    const IsSafeResponseType = z.object({
      isHarmful: z.boolean(),
      explanation: z.string(),
    });

    const runs = [];

    if (!specialConsiderations) {
      runs.push({
        isMini: false,
        content: [
          {
            type: "text",
            text: `Activity description: ${text}`,
          },
        ],
        responseFormat: zodResponseFormat(
          IsSafeResponseType,
          "IsSafeResponseType"
        ),
      });
    } else {
      runs.push(
        {
          isMini: false,
          content: [
            {
              type: "text",
              text: `Activity description: ${text}`,
            },
          ],
        },
        {
          isMini: false,
          content: [
            {
              type: "text",
              text: `The user has this special consideration: ${specialConsiderations}. Does it change your verdict?`,
            },
          ],
          responseFormat: zodResponseFormat(
            IsSafeResponseType,
            "IsSafeResponseType"
          ),
        }
      );
    }

    const response = await askRepeatedly({
      systemContent: systemContent,
      runs: runs as RunType[],
      userId,
    });

    return response;
  } catch (err) {
    throw httpError(err);
  }
}
