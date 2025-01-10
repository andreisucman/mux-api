import askRepeatedly from "functions/askRepeatedly.js";
import { RunType } from "types/askOpenaiTypes.js";
import { CategoryNameEnum } from "@/types.js";
import httpError from "@/helpers/httpError.js";

type UpdateAboutBioProps = {
  userId: string;
  text: string;
  segment: string;
  categoryName: CategoryNameEnum;
};

export default async function generateBioContent({
  userId,
  segment,
  categoryName,
  text,
}: UpdateAboutBioProps) {
  try {
    const finalSegment = `${
      segment === "tips"
        ? "the face and outfit styling tips from the user"
        : segment === "style"
        ? "the user's face and outfit style choices"
        : "the user's character and life philosophy"
    }`;

    let systemContent = `You are given a part of the user's interview and a topic to write about. Create a 3-5 sentences biography style content on the topic based on the interview. Come up with additional details to make your content engaging, but don't make up new facts. Your goall is to create the given information into an engaging personality description in 3-5 sentences. Write from the name of the user in the first person style I/me. Use simple, conversational language.}`;

    if (segment === "tips")
      systemContent +=
        "Your response should be an advice to other people on how to achieve a outlook similar to yours. Avoid generic advice, be specific.";

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
            text: `The topic is: ${finalSegment}.`,
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
    throw httpError(err.message, err.status);
  }
}
