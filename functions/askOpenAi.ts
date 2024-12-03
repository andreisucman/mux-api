import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { db, openai } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import { AskOpenaiProps } from "types/askOpenaiTypes.js";
import httpError from "@/helpers/httpError.js";

async function askOpenAi({
  messages,
  seed,
  model,
  meta,
  isMini,
  userId,
  responseFormat,
  isJson = true,
}: AskOpenaiProps) {
  try {
    const finalModel = model
      ? model
      : isMini
      ? process.env.MODEL_MINI
      : process.env.MODEL;

    const options: { [key: string]: any } = {
      messages,
      seed,
      model: finalModel,
      temperature: 0,
    };

    if (isJson) options.response_format = { type: "json_object" };
    if (responseFormat) options.response_format = responseFormat;

    const completion = await doWithRetries(async () =>
      openai.chat.completions.create(options as any)
    );

    const update: { [key: string]: any } = {
      $set: {},
      $inc: {
        [finalModel]: completion.usage.total_tokens,
      },
    };

    if (meta) update.$set.meta = meta;

    doWithRetries(async () =>
      db
        .collection("Spend")
        .updateOne({ userId: new ObjectId(userId) }, update, {
          upsert: true,
        })
    );

    return {
      result: isJson
        ? JSON.parse(completion.choices[0].message.content)
        : completion.choices[0].message.content,
      tokens: completion.usage.total_tokens,
    };
  } catch (err) {
    throw httpError(err);
  }
}

export default askOpenAi;
