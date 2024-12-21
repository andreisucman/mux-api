import z from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import askRepeatedly from "functions/askRepeatedly.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { isImagePositionValidRequirements } from "@/data/isImagePositionValidRequirements.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  image: string;
  part: string;
  position: string;
};

export default async function isImagePositionValid({
  userId,
  image,
  part,
  position,
}: Props) {
  try {
    let requirement;

    if (position) {
      requirement = isImagePositionValidRequirements.find(
        (obj) => obj.part === part && obj.position === position
      );
    } else {
      requirement = isImagePositionValidRequirements.find(
        (obj) => obj.part === part
      );
    }

    if (!requirement) {
      return { verdict: false, message: "Bad request" };
    }

    const ValidateImagePositionResponseType = z
      .boolean()
      .describe("respond with a true if yes and false if not");

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
        ],
        responseFormat: zodResponseFormat(
          ValidateImagePositionResponseType,
          "ValidateImagePositionResponseType"
        ),
      },
    ];

    const isValid = await askRepeatedly({
      userId,
      systemContent: requirement.requirement,
      runs: runs as RunType[],
      functionName: "validateImagePosition",
    });

    return { verdict: isValid, message: requirement.message };
  } catch (err) {
    throw httpError(err);
  }
}
