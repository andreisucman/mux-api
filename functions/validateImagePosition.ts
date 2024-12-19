import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import askRepeatedly from "functions/askRepeatedly.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { validateImagePositionRequirements } from "data/validateImagePositionRequirements.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  image: string;
  part: string;
  position: string;
};

export default async function validateImagePosition({
  userId,
  image,
  part,
  position,
}: Props) {
  try {
    let requirement;

    if (position) {
      requirement = validateImagePositionRequirements.find(
        (obj) => obj.part === part && obj.position === position
      );
    } else {
      requirement = validateImagePositionRequirements.find(
        (obj) => obj.part === part
      );
    }

    if (!requirement) {
      return { verdict: false, message: "Bad request" };
    }

    const samePersonContent = `${requirement.requirement} Format your reponse as a JSON with this structure: {verdict: true if yes, false if not}`;

    const ValidateImagePositionResponseType = z.object({
      verdict: z.boolean(),
    });

    const runs = [
      {
        isMini: true,
        content: [
          {
            type: "image_url",
            image_url: {
              url: image,
              detail: "low",
            },
          },
          {
            type: "text",
            text: requirement.requirement,
          },
        ],
        responseFormat: zodResponseFormat(
          ValidateImagePositionResponseType,
          "ValidateImagePositionResponseType"
        ),
      },
    ];

    const response = await askRepeatedly({
      userId,
      systemContent: samePersonContent,
      runs: runs as RunType[],
      functionName: "validateImagePosition",
    });

    return { verdict: response.verdict, message: requirement.message };
  } catch (err) {
    throw httpError(err);
  }
}
