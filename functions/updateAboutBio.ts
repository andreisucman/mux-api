import z from "zod";
import askRepeatedly from "functions/askRepeatedly.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { RunType } from "types/askOpenaiTypes.js";
import doWithRetries from "helpers/doWithRetries.js";
import { upperFirst } from "helpers/utils.js";
import httpError from "@/helpers/httpError.js";

type UpdateAboutBioProps = {
  userId: string;
  question: string;
  reply: string;
  currentBio: {
    philosophy: string;
    style: string;
    tips: string;
  };
};

type UpdateBioPartProps = {
  partName: string;
  currentPart: string;
  question: string;
  reply: string;
  userId: string;
};

async function updateBioPart({
  partName,
  currentPart,
  question,
  reply,
  userId,
}: UpdateBioPartProps) {
  try {
    const finalPartName = `${
      partName === "tips"
        ? "face and outfit style tips"
        : partName === "style"
        ? "face and outfit style"
        : partName === "philosophy"
        ? "life philosophy in general"
        : partName
    }`;

    const UpdateBioPartResponseType = z.object({
      isUpdated: z
        .boolean()
        .describe(
          `true if the new information is related to the ${finalPartName} and text was updated, otherwise false`
        ),
      updatedText: z
        .string()
        .describe(
          "the updated text or empty string if the text wasn't updated"
        ),
    });

    let systemContent = `You are given a text about the user's ${finalPartName} and the additional information. Create a biography style description about the user's ${finalPartName} based on the information you have. Come up with additional details for the provided information to make the story engaging, but don't make up new facts. Your goall is to turn the existing text into an engaging personality description. Write from the name of the user in the first person style I/me}`;

    if (partName === "tips")
      systemContent +=
        "Your response should be an advice to other people on how to achieve a look similar to yours. Avoid generic advice, be specific.";

    const runs = [
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `${upperFirst(finalPartName)}: ${currentPart}`,
          },
          {
            type: "text",
            text: `Additional information: -${question}? -${reply}.`,
          },
        ],
        responseFormat: zodResponseFormat(
          UpdateBioPartResponseType,
          "UpdateBioPartResponseType"
        ),
      },
    ];

    const response: { isUpdated: boolean; updatedText: string } =
      await askRepeatedly({
        systemContent,
        runs: runs as RunType[],
        userId,
        functionName: "updateAboutBio",
      });

    const finalResponse: {
      isUpdated: boolean;
      updatedText: string;
      partName: string;
    } = { ...response, partName };

    return finalResponse;
  } catch (err) {
    console.log("Error in handleUpdatePart: ", err);
  }
}

export default async function updateAboutBio({
  userId,
  question,
  reply,
  currentBio,
}: UpdateAboutBioProps) {
  try {
    const keys = Object.keys(currentBio);

    const promises = keys.map((key) =>
      doWithRetries(async () =>
        updateBioPart({
          reply,
          question,
          userId,
          partName: key,
          currentPart: currentBio[key as "philosophy"],
        })
      )
    );

    const responses = await Promise.all(promises);

    const newBio: { [key: string]: string } = {};

    for (const response of responses) {
      newBio[response.partName] = response.isUpdated
        ? response.updatedText
        : currentBio[response.partName as "philosophy"];
    }

    return newBio;
  } catch (err) {
    throw httpError(err);
  }
}
