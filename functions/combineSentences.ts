import httpError from "@/helpers/httpError.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import askRepeatedly from "functions/askRepeatedly.js";

type Props = {
  sentences: string[];
  userId: string;
};

export default async function combineSentences({ sentences, userId }: Props) {
  const systemContent = `Combine the senteces the user provides into one, easy-to-understand concise sentence. Format your response as a JSON object with the following structure: {newSentence: your combined sentence}.`;

  try {
    const runs: RunType[] = [
      {
        isMini: true,
        content: [
          ...sentences.map((sentence) => ({
            type: "text" as "text",
            text: sentence,
          })),
        ],
      },
    ];

    const response = await askRepeatedly({
      runs,
      userId,
      systemContent,
    });

    const { newSentence } = response || {};

    return newSentence;
  } catch (err) {
    throw httpError(err);
  }
}
