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
import findRelevantSuggestions from "@/functions/findRelevantSuggestions.js";
import extractProductsFromImage from "@/functions/extractProductsFromImage.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { constraints, taskId, productsImage } = req.body;

    const analysisType = `createRecipe-${taskId}`;

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
          adminDb.collection("HarmfulTaskDescriptions").insertOne({
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

      const { name, instruction, concern, recipe } = taskInfo;

      if (recipe && !recipe?.canPersonalize) {
        res.status(200).json({
          error: `You have already generated a new recipe.`,
        });
        return;
      }

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

      global.startInterval(
        () =>
          incrementProgress({
            operationKey: analysisType,
            userId: req.userId,
            value: 1,
          }),
        3000
      );

      res.status(200).end();

      /* generate recipe */
      let systemContent = `You are an experienced cook. The user gives you a recipe they don't like, your goal is to come up with another recipe of a food with similar amount of calories that an average user can cook at home. Your response is a step-by-step recipe instruction where each step is numbered and separated by \n.`;

      if (specialConsiderations)
        systemContent += `Consider the following special considerations of the user: ${specialConsiderations}.`;

      const runs: RunType[] = [];

      const initialMessage: RunType = {
        model: "deepseek-chat",
        content: [
          {
            type: "text",
            text: `Here is the recipe the user didn't like: ${name}. ${instruction} \n.`,
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
          text: `Here are the user's constraints: ${constraints}. Ensure your recipe accounts for that.`,
        });
      }

      if (productsImage) {
        const productsOnTheImage = await extractProductsFromImage({
          imageUrl: productsImage,
          userId: req.userId,
        });

        if (productsOnTheImage.trim()) {
          initialMessage.content.push({
            type: "text",
            text: `The user has these products at hand: ${productsOnTheImage}. Your recipe should be primarily made of them.`,
          });
        }
      }

      runs.push(initialMessage);

      const checkMessage: RunType = {
        model: "deepseek-chat",
        content: [
          {
            type: "text",
            text: `Does your recipe satisfy the number of calories from the default instruction? If not change it to match the approximate calorie count.`,
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

      runs.push({
        model: "gpt-4o-mini",
        content: [
          {
            type: "text",
            text: `Format the recipe as an object`,
          },
        ],
        responseFormat: zodResponseFormat(
          RecipeResponseFormat,
          "RecipeResponseFormat"
        ),
        callback: () =>
          incrementProgress({
            value: 5,
            operationKey: analysisType,
            userId: req.userId,
          }),
      });

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
                examples: [{ type: "image", url: image }],
                canPersonalize: false,
                name: response.name,
                productTypes: response.productTypes,
                description: response.description,
                instruction: response.instruction,
              },
              suggestions,
            },
          }
        )
      );

      global.stopInterval();
      res.status(200).end();
    } catch (err) {
      await addAnalysisStatusError({
        operationKey: analysisType,
        userId: String(req.userId),
        message:
          "An unexpected error occured. Please try again and inform us if the error persists.",
        originalMessage: err.message,
      });
      global.stopInterval();
      next(err);
    }
  }
);

export default route;
