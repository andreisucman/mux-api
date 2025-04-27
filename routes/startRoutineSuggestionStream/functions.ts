import askRepeatedly from "@/functions/askRepeatedly.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import findEmoji from "@/helpers/findEmoji.js";
import { convertKeysAndValuesTotoSnakeCase, normalizeString } from "@/helpers/utils.js";
import { db } from "@/init.js";
import { CategoryNameEnum, ScoreType } from "@/types.js";
import { RunType } from "@/types/askOpenaiTypes.js";
import { RoutineSuggestionTaskType } from "@/types/updateRoutineSuggestionTypes.js";
import { ObjectId } from "mongodb";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { generateRandomPastelColor } from "make-random-color";
import { z } from "zod";

const finalizeSuggestion = async (
  routineSuggestionId: ObjectId,
  concernScores: ScoreType[],
  solutionResponse: string,
  userId: string,
  reasoning: string
) => {
  const { tasks, summary } = await summarizeRoutineSuggestions(concernScores, solutionResponse, userId, reasoning);

  await doWithRetries(async () =>
    db.collection("RoutineSuggestion").updateOne(
      {
        _id: new ObjectId(routineSuggestionId),
      },
      {
        $set: {
          tasks,
          summary,
          reasoning,
        },
      }
    )
  );
};

const summarizeRoutineSuggestions = async (
  concernScores: ScoreType[],
  solutionsResponse: string,
  userId: string,
  reasoning: string
): Promise<{ summary: string; tasks: { [concern: string]: RoutineSuggestionTaskType[] } }> => {
  const systemContent = `You are a dermatologist. You are given the infromation about the user's concerns and a routine for improving them and the reasoning for choosing the tasks in the routine. Your goal is to summarize this information in 3-4 sentences explaining why the tasks in the routine have been chosen and how they are going to improve the concerns.`;

  const ChooseSolutonForConcernsResponseType = z.object({
    summary: z
      .string()
      .describe(
        "3-4 sentences in 2nd tense (you/your) and simple casual language, summarizing why the following tasks have been chosen and how are they going to help improve the concerns."
      ),
    tasks: z.object(
      concernScores.reduce((a, c) => {
        a[c.name] = z
          .array(
            z.object({
              task: z.string().describe("The name of the task in imperative form"),
              numberOfTimesInAMonth: z.number().describe("The number of times the solution has to be done in a month"),
            })
          )
          .describe(`The array of solutions for the ${c.name} concern`);
        return a;
      }, {})
    ),
  });

  const concernsAndDescriptions = concernScores
    .map((co) => `Concern: ${normalizeString(co.name)}. Severity: ${co.value}/100. Description: ${co.explanation}`)
    .join("\n\n");

  const runs: RunType[] = [
    {
      model: "gpt-4o-mini",
      content: [
        { type: "text", text: `\n\n<-- The user's concerns and their description -->\n\n ${concernsAndDescriptions}.` },
        { type: "text", text: `\n\n<-- The routine to improve the concerns -->\n\n ${solutionsResponse}.` },
        { type: "text", text: `\n\n<-- The reasoning for the routine -->\n\n ${reasoning}.` },
      ],
      responseFormat: zodResponseFormat(ChooseSolutonForConcernsResponseType, "ChooseSolutonForConcernsResponseType"),
    },
  ];

  const response: { summary: string; tasks: { [concern: string]: { task: string; numberOfTimesInAMonth: number }[] } } =
    await askRepeatedly({
      runs,
      categoryName: CategoryNameEnum.TASKS,
      functionName: "summarizeRoutineSuggestions",
      systemContent,
      userId,
    });

  const snakeCaseTasks = convertKeysAndValuesTotoSnakeCase(response.tasks);

  const taskNames = Object.values(snakeCaseTasks)
    .flat()
    .map((t) => t.task);

  const icons = await findEmoji({ taskNames, userId });

  const namesWithIcons = taskNames.map((n) => ({ task: n, icon: icons[n] }));

  const tasksWithIcons = Object.fromEntries(
    Object.entries(snakeCaseTasks).map(([concern, tasksArray]) => [
      concern,
      tasksArray.map((t) => {
        const nameIconObject = namesWithIcons.find((obj) => obj.task === t.task);
        const color = generateRandomPastelColor();
        return { ...t, concern, icon: nameIconObject.icon, color };
      }),
    ])
  );

  return { summary: response.summary, tasks: tasksWithIcons };
};

export { summarizeRoutineSuggestions, finalizeSuggestion };
