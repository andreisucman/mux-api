import httpError from "@/helpers/httpError.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { CategoryNameEnum } from "@/types.js";
import askRepeatedly from "functions/askRepeatedly.js";

type Props = {
  userNote: string;
  userId: string;
  categoryName: CategoryNameEnum;
};

export default async function rephraseUserNote({
  userNote,
  userId,
  categoryName,
}: Props) {
  try {
    let systemContent = `The user gives you a text. Your goal is to check if this text contains any references to dates (or point in time) such as 'yesterday', 'two weeks ago' and alike.`;

    let runs = [
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `### Text: ${userNote}.`,
          },
        ],
      },
      {
        isMini: true,
        content: [
          {
            type: "text",
            text: `Format your response as a JSON object with this structure: {verdict: true if the Text has any references to any date (or point in time), else false}`,
          },
        ],
      },
    ];

    const { verdict } = await askRepeatedly({
      systemContent,
      runs: runs as RunType[],
      userId,
      categoryName,
      functionName: "rephraseUserNote",
    });

    if (!verdict) {
      return userNote;
    }

    systemContent = `The user gives you a text. Your goal is to check if this text contains any relative references to dates (i.e. any words that represent a relative point in time). If yes replace those date references with the exact dates based on the today's date - (${new Date().toDateString()}). Example: Text: I went to the doctor yesterday. Today's date: 10 Jan 2024. rephrasedText: I went to the doctor at 9 Jan 2024.`;

    runs = [
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: `### Text: ${userNote}. Today's date: ${new Date().toDateString()}.`,
          },
        ],
      },
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: "If you can't determine the date, determine the month and take it's middle date. If you can't determine the month consider it to be the today date's month.",
          },
        ],
      },
      {
        isMini: false,
        content: [
          {
            type: "text",
            text: "Format your response as a JSON object with this structure: {rephrasedText: the original text with the rephrased date references}. Think step-by-step. Follow this instruction strictly.",
          },
        ],
      },
    ];

    const { rephrasedText } = await askRepeatedly({
      userId,
      categoryName,
      systemContent,
      runs: runs as RunType[],
      functionName: "rephraseUserNote",
    });

    return rephrasedText;
  } catch (err) {
    throw httpError(err);
  }
}
