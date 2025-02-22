import askRepeatedly from "functions/askRepeatedly.js";
import { RunType } from "types/askOpenaiTypes.js";
import { CategoryNameEnum } from "@/types.js";
import httpError from "@/helpers/httpError.js";

type UpdateAboutBioProps = {
  userId: string;
  text: string;
  categoryName: CategoryNameEnum;
};

export default async function generateBioContent({
  userId,
  categoryName,
  text,
}: UpdateAboutBioProps) {
  try {
    let systemContent = `You are given a part of the user's interview and a topic to write about. Create a 3-5 sentences biography style content on the topic based on the interview. Come up with additional details to make your content engaging, but don't make up new facts. Your goall is to create the given information into an engaging personality description in 3-5 sentences. Write from the name of the user in the first person style I/me. Use simple, conversational language.`;

    const runs = [
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `The interview is ${text}`,
          },
          {
            type: "text",
            text: `The topic is: the user's character, philosophy and lifestyle.`,
          },
        ],
      },
    ];

    return await askRepeatedly({
      runs: runs as RunType[],
      userId,
      categoryName,
      systemContent,
      isResultString: true,
      functionName: "updateAboutBio",
    });
  } catch (err) {
    throw httpError(err);
  }
}
