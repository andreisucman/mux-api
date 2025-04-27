import { Router } from "express";
import { nanoid } from "nanoid";
import { deepSeek, db, redis } from "@/init.js";
import { setupSSE, toSentenceCase } from "@/helpers/utils.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import { ObjectId } from "mongodb";
import { CustomRequest } from "@/types.js";
import { RoutineSuggestionType } from "@/types/updateRoutineSuggestionTypes.js";
import { finalizeSuggestion } from "./startRoutineSuggestionStream/functions.js";
import updateNextRun from "@/helpers/updateNextRun.js";
import getUserInfo from "@/functions/getUserInfo.js";

const route = Router();

route.post("/:routineSuggestionId", async (req: CustomRequest, res) => {
  const { routineSuggestionId } = req.params;
  const streamId = `suggestion_${nanoid()}`;
  const channel = `sse:${streamId}`;
  const publisher = redis.duplicate();

  if (!routineSuggestionId) {
    res.write("event: error\n\ndata: Please start the analysis anew.\n\n");
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
        { projection: { previousExperience: 1, questionsAndAnswers: 1, concernScores: 1, reasoning: 1, part: 1 } }
      )
    )) as unknown as RoutineSuggestionType | null;

    if (!latestSuggestion) {
      res.write("event: error\n\ndata: Please start the analysis anew.\n\n");
      res.end();
      return;
    }

    if (latestSuggestion.reasoning) {
      res.write(`data: ${latestSuggestion.reasoning}\n\n`);
      res.end();
      return;
    }

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
    res.write(`id: ${streamId}\n`);

    let systemContent = `You are a dermatologist. Your goal is to come up with a combination of the most effective solutions that the patient can do to improve each of their concerns. In your response: 1. Each solution must represent a standalone individual task with the number of times it has to be done in a month (frequency). 2. Each solution should have a 1-sentence explanation of how it's going to help improve the concern. 3. Consider the severity of the concerns, their description and feedback from the user when deciding which task to suggest. 4. Don't combine tasks.  5. Don't suggest apps, or passive activities such as sleeping.`;

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
      .join("\n");

    let userContent = `<-- About me --> \n\n ${userAboutString}`;

    userContent += `<-- My concerns are -->\n\n ${concernsWithSeverities}.`;

    if (previousExperience) {
      userContent += ` <-- Here is what I've tried -->\n\n ${previousExperience}.`;
    }

    if (questionAnswers) {
      userContent += `<-- Here are my answers to the additional questions -->\n\n ${questionAnswers}.`;
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

      res.write(`data: ${reasoningChunk}\n\n`);
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

    const updatedNextRoutineSuggestion = updateNextRun({
      nextRun: userInfo.nextRoutineSuggestion,
      parts: [latestSuggestion.part],
    });

    await doWithRetries(() =>
      db
        .collection("User")
        .updateOne({ _id: new ObjectId(req.userId) }, { $set: { nextRoutineSuggestion: updatedNextRoutineSuggestion } })
    );

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
    res.write("event: error\n\ndata: Stream error\n\n");
    res.end();
  } finally {
    if (publisher?.isOpen) await publisher.quit();
  }
});

export default route;
