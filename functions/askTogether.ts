import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import { RoleEnum } from "@/types/askOpenaiTypes.js";
import { db, together } from "init.js";
import httpError from "@/helpers/httpError.js";

type AskTogetherProps = {
  userId: string;
  seed?: number;
  model: string;
  messages: { role: RoleEnum; content: string }[];
  isJson?: boolean;
  meta?: string;
};

async function askTogether({
  messages,
  model,
  meta,
  userId,
}: AskTogetherProps) {
  try {
    if (!model) throw httpError("Model is missing");

    const options: { [key: string]: any } = {
      messages,
      model,
      temperature: 0,
    };

    const completion = await doWithRetries(async () =>
      together.chat.completions.create(options as any)
    );

    const escapedKey = model.replace(/\./g, "\\.");

    const update: { [key: string]: any } = {
      $set: {},
      $inc: {
        [escapedKey]: completion.usage.total_tokens,
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
      result: completion.choices[0].message.content,
      tokens: completion.usage.total_tokens,
    };
  } catch (err) {
    throw httpError(err);
  }
}

export default askTogether;
