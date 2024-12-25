import uploadFilesToS3 from "functions/uploadFilesToS3.js";
import doWithRetries from "helpers/doWithRetries.js";
import askTogether from "functions/askTogether.js";
import { RoleEnum } from "@/types/askOpenaiTypes.js";
import { together } from "init.js";
import updateSpend from "./updateSpend.js";
import { CategoryNameEnum } from "@/types.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  description: string;
  userId: string;
  categoryName: CategoryNameEnum;
};

export default async function generateImage({
  description,
  categoryName,
  userId,
}: Props) {
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

    const prompt = await askTogether({
      messages,
      userId,
      categoryName,
      model: "meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo",
      functionName: "generateImage",
    });

    const width = 480;
    const height = 288;

    const model = "black-forest-labs/FLUX.1.1-pro";

    const imageResponse: any = await doWithRetries(
      async () =>
        await together.images.create({
          model,
          prompt,
          steps: 20,
          n: 1,
          width,
          height,
          negative_prompt: "deformed, scary, blurred, unrealistic",
        })
    );

    const units = width * height;
    const unitCost = Number(process.env.IMAGE_GENERATION_PRICE) / 1000000;

    updateSpend({
      userId,
      unitCost,
      units,
      functionName: "generateImage",
      modelName: model.split(".").join("_"),
      categoryName,
    });

    const image = imageResponse.data[0].url;

    const spacesUrls = await uploadFilesToS3([image]);

    return spacesUrls[0];
  } catch (err) {
    throw httpError(err);
  }
}
