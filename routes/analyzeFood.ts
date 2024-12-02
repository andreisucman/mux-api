import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response } from "express";
import { ObjectId } from "mongodb";
import { CustomRequest, UserConcernType } from "types.js";
import addErrorLog from "functions/addErrorLog.js";
import { createHashKey } from "@/functions/createHashKey.js";
import createImageEmbedding from "@/functions/createImageEmbedding.js";
import checkImageSimilarity from "functions/checkImageSimilarity.js";
import analyzeCalories from "functions/analyzeCalories.js";
import doWithRetries from "helpers/doWithRetries.js";
import validateImage from "functions/validateImage.js";
import { db } from "init.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response) => {
  const { url } = req.body;

  if (!url) {
    res.status(400).json({
      error: "Bad request",
    });
    return;
  }

  try {
    // const localFile = await saveLocally(url);
    // const isProhibited = await checkForProhibitedContent(localFile);

    // if (isProhibited) {
    //   res.status(200).json({ error: "This image contains prohibited content" });
    //   return;
    // }

    const { verdict: isValid } = await validateImage({
      condition: "This is a photo of a ready to eat food",
      image: url,
      userId: req.userId,
    });

    if (!isValid) {
      res.status(200).json({
        error: "It must be a photo of a ready to eat food",
      });
      return;
    }

    const hash = await createHashKey(url);
    const embedding = await createImageEmbedding(url);

    const { status: isValidSimilarity, record } = await checkImageSimilarity({
      userId: req.userId,
      hash,
      embedding,
      collection: "FoodAnalysis",
      vectorIndexName: "food_image_search",
    });

    if (!isValidSimilarity) {
      res.status(200).json({
        message: record.analysis,
      });
      return;
    }

    let userAbout = "";

    if (req.userId) {
      const userInfo = (await doWithRetries({
        functionName: "analyzeFood - get userInfo",
        functionToExecute: async () =>
          db
            .collection("User")
            .findOne(
              { _id: new ObjectId(req.userId) },
              { projection: { specialConsiderations: 1, concerns: 1 } }
            ),
      })) as unknown as {
        specialConsiderations: string;
        concerns: UserConcernType[];
      };

      if (userInfo) {
        const { concerns, specialConsiderations } = userInfo;
        const activeConcerns = concerns.filter((obj) => !obj.isDisabled);
        const concernsAbout = activeConcerns.map((c) => c.name).join(", ");
        userAbout += `My concerns are: ${concernsAbout}.`;
        if (specialConsiderations) {
          userAbout += ` My special considerations are: ${specialConsiderations}.`;
        }
      }
    }

    const analysis = await analyzeCalories({
      url,
      userId: req.userId,
      userAbout,
    });

    const newRecord: { [key: string]: any } = {
      createdAt: new Date(),
      analysis,
      url,
      embedding,
      hash,
    };

    if (req.userId) newRecord.userId = new ObjectId(req.userId);

    doWithRetries({
      functionName: "analyzeFood - add a record",
      functionToExecute: async () =>
        db.collection("FoodAnalysis").insertOne(newRecord),
    }).catch();

    res.status(200).json({ message: analysis });
  } catch (error) {
    addErrorLog({ functionName: "analyzeFood", message: error.message });
    res.status(500).json({ error: "Internal server error" });
  }
});

export default route;
