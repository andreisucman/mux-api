import * as dotenv from "dotenv";
dotenv.config();

import z from "zod";
import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import isActivityHarmful from "@/functions/isActivityHarmful.js";
import doWithRetries from "helpers/doWithRetries.js";
import { RunType } from "types/askOpenaiTypes.js";
import {
  CategoryNameEnum,
  CustomRequest,
  ModerationStatusEnum,
  SubscriptionTypeNamesEnum,
  UserInfoType,
} from "types.js";
import askRepeatedly from "functions/askRepeatedly.js";
import generateImage from "functions/generateImage.js";
import checkSubscriptionStatus from "functions/checkSubscription.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import { adminDb, db } from "init.js";
import httpError from "@/helpers/httpError.js";
import { urlToBase64 } from "@/helpers/utils.js";
import findRelevantSuggestions from "@/functions/findRelevantSuggestions.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { constraints, taskId, productsImage } = req.body;

    if (!ObjectId.isValid(taskId)) {
      res.status(400).json({
        error: "Bad request",
      });
      return;
    }

    try {
      const subscriptionIsValid: boolean = await checkSubscriptionStatus({
        userId: req.userId,
        subscriptionType: SubscriptionTypeNamesEnum.IMPROVEMENT,
      });

      if (!subscriptionIsValid) {
        res.status(200).json({ error: "subscription expired" });
        return;
      }

      const { isHarmful, explanation } = await isActivityHarmful({
        userId: req.userId,
        text: constraints,
        categoryName: CategoryNameEnum.TASKS,
      });

      if (isHarmful) {
        await doWithRetries(async () =>
          db.collection("HarmfulTaskDescriptions").insertOne({
            userId: new ObjectId(req.userId),
            response: explanation,
            type: "createRecipe",
            text: constraints,
          })
        );
        res.status(200).json({
          error: `This task violates our ToS.`,
        });
        return;
      }

      const userInfo = (await doWithRetries(async () =>
        db.collection("User").findOne(
          {
            _id: new ObjectId(req.userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          {
            projection: {
              concern: 1,
              timeZone: 1,
              demographics: 1,
              specialConsiderations: 1,
            },
          }
        )
      )) as unknown as UserInfoType;

      const { specialConsiderations } = userInfo;

      const taskInfo = await doWithRetries(async () =>
        db.collection("Task").findOne(
          { _id: new ObjectId(taskId) },
          {
            projection: {
              key: 1,
              recipe: 1,
              concern: 1,
              instruction: 1,
            },
          }
        )
      );

      if (!taskInfo) throw httpError(`Task ${taskId} not found`);

      const { instruction, concern, recipe } = taskInfo;

      if (recipe) {
        res.status(200).json({
          error: `The recipe for this task already exists.`,
        });
        return;
      }

      res.status(200).end();

      const analysisType = `createRecipe-${taskId}`;

      await doWithRetries(async () =>
        db.collection("AnalysisStatus").updateOne(
          { userId: new ObjectId(req.userId), operationKey: analysisType },
          {
            $set: { isRunning: true, progress: 1 },
            $unset: { isError: "" },
          },
          { upsert: true }
        )
      );

      /* generate recipe */
      let systemContent = `You are an experienced cook. Your goal is to come up with a simple recipe with up to 5 steps, that satisfies the following default instruction: <-->Default instruction: ${instruction}.`;

      if (constraints || productsImage) {
        systemContent += `and is made from the products that the user provides.`;
      }

      const runs: RunType[] = [];

      const initialMessage: RunType = {
        isMini: false,
        content: [
          {
            type: "text",
            text: `Please write me a step-by-step recipe instruction where each step is separated by \n.`,
          },
        ],
        callback: () =>
          incrementProgress({
            value: 5,
            operationKey: analysisType,
            userId: req.userId,
          }),
      };

      if (constraints) {
        initialMessage.content.push({
          type: "text",
          text: `Here is what I have: ${constraints}.`,
        });
      }

      if (productsImage) {
        initialMessage.content.push(
          {
            type: "text",
            text: "Here is a picture of the products I have:",
          },
          {
            type: "image_url" as "image_url",
            image_url: {
              url: await urlToBase64(productsImage),
              detail: "low",
            },
          }
        );
      }

      runs.push(initialMessage);

      if (specialConsiderations) {
        runs.push({
          isMini: false,
          content: [
            {
              type: "text",
              text: `Does your recipe satisfy my following special condition: ${specialConsiderations}? If not, change it to do it.`,
            },
          ],
          callback: () =>
            incrementProgress({
              value: 15,
              operationKey: analysisType,
              userId: req.userId,
            }),
        });
      }

      const checkMessage: RunType = {
        isMini: false,
        content: [
          {
            type: "text",
            text: `Does your recipe satisfy the number of calories from the default instruction? If not add or remove products to match the calorie count.`,
          },
        ],
        callback: () =>
          incrementProgress({
            value: 5,
            operationKey: analysisType,
            userId: req.userId,
          }),
      };

      if (constraints) {
        checkMessage.content.push({
          type: "text",
          text: `Is your recipe primarily made from the products I shared? If not change it to be so.`,
        });
      }

      runs.push(checkMessage);

      const RecipeResponseFormat = z.object({
        name: z.string().describe("the name of the recipe"),
        description: z
          .string()
          .describe(
            `a 2-sentence explanation of the benefits of this recipe for addressing this concern: ${concern}`
          ),
        instruction: z
          .string()
          .describe(
            "a step-by-step instruction on how to prepare it where each step on a new line (is separated by \n)"
          ),
        productTypes: z
          .array(z.string())
          .describe(
            "an array strings of product type names used in the recipe in singular form (e.g. potato, olive oil, chicken breast, etc...)"
          ),
      });

      const lastMessage = runs[runs.length - 1];
      lastMessage.responseFormat = zodResponseFormat(
        RecipeResponseFormat,
        "RecipeResponseFormat"
      );

      const response = await askRepeatedly({
        runs,
        systemContent,
        categoryName: CategoryNameEnum.TASKS,
        userId: req.userId,
        functionName: "createRecipe",
      });

      const image = await generateImage({
        description: `A plate of ${response.name}.`,
        userId: req.userId,
        categoryName: CategoryNameEnum.TASKS,
      });

      await incrementProgress({
        value: 15,
        operationKey: analysisType,
        userId: req.userId,
      });

      const suggestions = await findRelevantSuggestions(response.productTypes);

      await doWithRetries(async () =>
        db.collection("AnalysisStatus").updateOne(
          { userId: new ObjectId(req.userId), operationKey: analysisType },
          {
            $set: { isRunning: false, progress: 0 },
            $unset: { isError: "" },
          }
        )
      );

      await doWithRetries(async () =>
        db.collection("Task").updateOne(
          { _id: new ObjectId(taskId) },
          {
            $set: {
              recipe: {
                image,
                canPersonalize: false,
                name: response.name,
                description: response.description,
                instruction: response.instruction,
              },
              productTypes: response.productTypes,
              suggestions,
            },
          }
        )
      );

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
