import { Router } from "express";
import { nanoid } from "nanoid";
import { deepSeek, db, redis } from "@/init.js";
import { daysFrom, setupSSE, toSentenceCase } from "@/helpers/utils.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import { ObjectId } from "mongodb";
import { CustomRequest, TaskStatusEnum } from "@/types.js";
import { RoutineSuggestionType } from "@/types/updateRoutineSuggestionTypes.js";
import { finalizeSuggestion } from "./functions.js";
import updateNextRun from "@/helpers/updateNextRun.js";
import getUserInfo from "@/functions/getUserInfo.js";
import moderateContent from "@/functions/moderateContent.js";
import checkCanAction from "@/helpers/checkCanAction.js";

const route = Router();

route.post("/:routineSuggestionId", async (req: CustomRequest, res) => {
  const { routineSuggestionId } = req.params;
  const { revisionText } = req.body;
  const streamId = `suggestion_${nanoid()}`;
  const channel = `sse:${streamId}`;
  const publisher = redis.duplicate();

  if (revisionText) {
    const textModerationResponse = await moderateContent({
      content: [
        {
          type: "text",
          text: revisionText,
        },
      ],
    });

    if (!textModerationResponse.isSafe) {
      res.write("Your text appears to have inappropriate language. Please revise and try again.");
      res.end();
      return;
    }
  }

  if (!routineSuggestionId) {
    res.write("Please start the analysis anew.");
    res.end();
    return;
  }

  try {
    const userInfo = await getUserInfo({
      userId: req.userId,
      projection: { nextRoutineSuggestion: 1, demographics: 1, country: 1, timeZone: 1 },
    });

    const latestSuggestion = (await doWithRetries(() =>
      db.collection("RoutineSuggestion").findOne(
        {
          _id: new ObjectId(routineSuggestionId),
        },
        {
          projection: {
            previousExperience: 1,
            questionsAndAnswers: 1,
            concernScores: 1,
            reasoning: 1,
            part: 1,
            tasks: 1,
            isRevised: 1,
          },
        }
      )
    )) as unknown as RoutineSuggestionType | null;

    if (revisionText && latestSuggestion.isRevised) {
      res.write("This routine has already been revised.");
      res.end();
      return;
    }

    if (!latestSuggestion) {
      res.write("Please start the analysis anew.");
      res.end();
      return;
    }

    if (latestSuggestion.reasoning && !revisionText) {
      res.write(latestSuggestion.reasoning);
      res.end();
      return;
    }

    if (revisionText) {
      await doWithRetries(async () =>
        db.collection("RoutineSuggestion").updateOne(
          {
            _id: new ObjectId(routineSuggestionId),
          },
          {
            $set: {
              isRevised: true,
              revisionText,
            },
            $unset: {
              tasks: null,
              summary: null,
              reasoning: null,
            },
          }
        )
      );
    }

    const { checkBackDate, isActionAvailable } = await checkCanAction({
      nextAction: userInfo.nextRoutineSuggestion,
      part: latestSuggestion.part,
    });

    if (!isActionAvailable && !revisionText) {
      res.write(`You can get another suggestion analysis after ${checkBackDate}.`);
      res.end();
      return;
    }

    const updatedNextRoutineSuggestion = updateNextRun({
      nextRun: userInfo.nextRoutineSuggestion,
      parts: [latestSuggestion.part],
    });

    await doWithRetries(() =>
      db
        .collection("User")
        .updateOne({ _id: new ObjectId(req.userId) }, { $set: { nextRoutineSuggestion: updatedNextRoutineSuggestion } })
    );

    await publisher.connect();

    await redis.set(
      streamId,
      JSON.stringify({
        text: "",
        finished: false,
        error: false,
      }),
      { EX: 1800 }
    );
    setupSSE(res);
    res.write(`id: ${streamId}`);

    let systemContent = `You are a dermatologist and fitness coach. Your goal is to come up with a combination of the most effective solutions that the patient can do to improve each of their concerns. In your response: 1. Each solution must represent a standalone individual task with the number of times it has to be done in a month (frequency). 2. Each solution should have a 1-sentence explanation of how it's going to help improve the concern. 3. Consider the severity of the concerns, their description and feedback from the user when deciding which task to suggest. 4. Don't combine tasks.  5. Don't suggest apps, or passive activities such as sleeping.`;

    if (revisionText) {
      const previousTasks = Object.values(latestSuggestion.tasks)
        .flat()
        .map(
          (t) =>
            `Concern targeted: ${t.concern}. Task: ${t.task}. Number of times in a month: ${t.numberOfTimesInAMonth}`
        )
        .join("\n\n");
      systemContent += `In the past you have suggested this user the following routine: ###${previousTasks}###. And your reasoning was this: ###${latestSuggestion.reasoning}###. Don't recreate it from scratch, only modify according to the user's request.`;
    }

    const concernsWithSeverities = latestSuggestion.concernScores
      .filter((so) => so.value > 0)
      .map((so) => `Name: ${so.name}. Severity: ${so.value}/100. Description of the user's concern: ${so.explanation}.`)
      .join("\n\n");

    const previousExperience = Object.entries(latestSuggestion.previousExperience)
      .filter(([_, description]) => description.length > 0)
      .map(([concern, description]) => `For ${concern}: ${description}.`)
      .join("\n\n");

    const questionAnswers = Object.entries(latestSuggestion.questionsAndAnswers)
      .filter(([_, answer]) => answer.length > 0)
      .map(([question, answer]) => `Question: ${question}. Answer: ${answer}`)
      .join("\n\n");

    const userAboutString = Object.entries({
      ...userInfo.demographics,
      country: userInfo.country,
      timeZone: userInfo.timeZone,
    })
      .filter(([key, value]) => Boolean(value))
      .map(([key, value]) => `${toSentenceCase(key)}: ${value}`)
      .join(" ");

    let userContent = `<-- About me --> \n\n ${userAboutString}`;

    userContent += `<-- My concerns are -->\n\n ${concernsWithSeverities}.`;

    if (previousExperience) {
      userContent += ` <-- Here is what I've tried -->\n\n ${previousExperience}.`;
    }

    const lastMonth = daysFrom({ days: -30 });

    const pastTasks = await doWithRetries(async () =>
      db
        .collection("Task")
        .find(
          { userId: req.userId, status: TaskStatusEnum.COMPLETED, startsAt: { $gt: lastMonth } },
          { projection: { key: 1 } }
        )
        .toArray()
    );

    if (pastTasks.length > 0) {
      const pastTasksMap = pastTasks.reduce((a, c) => {
        if (a[c.key]) {
          a[c.key] += 1;
        } else {
          a[c.key] = 1;
        }
        return a;
      }, {});

      userContent += `<-- Here are the tasks I've completed in the last month and their count -->\n\n ${JSON.stringify(
        pastTasksMap
      )}`;
    }

    if (questionAnswers) {
      userContent += `<-- Here are my answers to the additional questions -->\n\n ${questionAnswers}.`;
    }

    if (revisionText) {
      userContent += `<-- Revision request -->\n\n Please revise your prevous routine as follows: ${revisionText}.`;
    }

    const messages: any = [
      { role: "system", content: systemContent },
      { role: "user", content: userContent },
    ];

    const completion: any = await deepSeek.chat.completions.create({
      model: "deepseek-reasoner",
      stream: true,
      messages,
    });

    let currentData;

    for await (const part of completion) {
      const reasoningChunk = part.choices[0]?.delta?.reasoning_content || "";

      currentData = JSON.parse(await redis.get(streamId));
      currentData.text += reasoningChunk;

      await redis.set(streamId, JSON.stringify(currentData), { EX: 1800 });

      await publisher.publish(
        channel,
        JSON.stringify({
          type: "chunk",
          content: reasoningChunk,
        })
      );

      res.write(reasoningChunk);
    }

    await publisher.publish(channel, JSON.stringify({ type: "close" }));
    await redis.set(
      streamId,
      JSON.stringify({
        text: currentData.text,
        finished: true,
      }),
      { EX: 1800 }
    );

    await publisher.quit();

    await finalizeSuggestion(
      latestSuggestion._id,
      latestSuggestion.concernScores,
      currentData.text,
      req.userId,
      currentData.text
    );

    if (publisher?.isOpen) await publisher.quit();
    res.end();
  } catch (err) {
    await publisher.publish(
      channel,
      JSON.stringify({
        type: "error",
        content: "Stream error",
      })
    );
    await redis.set(
      streamId,
      JSON.stringify({
        finished: true,
        error: true,
      }),
      { EX: 1800 }
    );
    if (publisher?.isOpen) await publisher.quit();
    res.write("Stream error");
    res.end();
  }
});

export default route;
