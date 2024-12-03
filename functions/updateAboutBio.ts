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
    about: string;
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
    const UpdateBioPartResponseType = z.object({
      isUpdated: z.boolean(),
      updatedText: z.string(),
    });

    const finalPartName = `${
      partName === "tips"
        ? "face and outfit style tips"
        : partName === "style"
        ? "face and outfit style"
        : partName === "philosophy"
        ? "life philosophy in general"
        : partName
    }`;

    const systemContent = `You are given a text about the user's ${finalPartName} and the new information. Your goal is check if there is anything in the new information related to the ${finalPartName} of the user and if yes, update the user's ${finalPartName} with the new information. Respond with a JSON object like this: {isUpdated: true if the text was updated, updatedText: the updated text if the new information is related, or empty string if not}`;

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
            text: `The new information: -${question}? -${reply}.`,
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
      doWithRetries({
        functionName: "updateAboutBio - updateBioPart",
        functionToExecute: async () =>
          updateBioPart({
            reply,
            question,
            userId,
            partName: key,
            currentPart: currentBio[key as "philosophy"],
          }),
      })
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
