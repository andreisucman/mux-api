import uploadFilesToS3 from "functions/uploadFilesToS3.js";
import doWithRetries from "helpers/doWithRetries.js";
import askTogether from "functions/askTogether.js";
import addErrorLog from "functions/addErrorLog.js";
import { RoleEnum } from "@/types/askOpenaiTypes.js";
import { together } from "init.js";

type Props = {
  description: string;
  userId: string;
};

export default async function generateImage({ description, userId }: Props) {
  try {
    const messages = [
      {
        role: "system" as RoleEnum,
        content: `Generate a 2 sentence image prompt from description describing a person engaging in the activity with a neutral background. Your response is the prompt only.`,
      },
      {
        role: "user" as RoleEnum,
        content: `Description: ${description}`,
      },
    ];

    const promptResponse = await askTogether({
      messages,
      userId,
      model: "meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo",
    });

    const { result: prompt } = promptResponse;

    console.log("prompt", prompt);

    const imageResponse: any = await doWithRetries({
      functionName: "generateImage",
      functionToExecute: async () =>
        await together.images.create({
          model: "black-forest-labs/FLUX.1-pro",
          prompt,
          steps: 20,
          n: 1,
          width: 480,
          height: 288,
          negative_prompt: "deformed, scary, blurred, unrealistic",
        }),
    });

    const image = imageResponse.data[0].url;

    const spacesUrls = await uploadFilesToS3([image]);

    return spacesUrls[0];
  } catch (err) {
    addErrorLog({ functionName: "generateImage", message: err.message });
    throw err;
  }
}
