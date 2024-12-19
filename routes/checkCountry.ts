import z from "zod";
import { ObjectId } from "mongodb";
import { CustomRequest } from "types.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { RunType } from "types/askOpenaiTypes.js";
import askRepeatedly from "functions/askRepeatedly.js";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { db } from "init.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { country } = req.body;
    try {
      const systemContent = `The user gives you the name of their country. If this is a valid country format it by its official name and ISO 3166-1 alpha-2 standard like so: {country: US}. If this is an invalid country return isValid as false and other fields as empty strings.`;

      const ConcernsResponseType = z.object({
        isValid: z.boolean(),
        country: z.string(),
      });

      const userContent = [
        {
          isMini: true,
          content: [
            {
              type: "text",
              text: `Is this a valid country: ${country}?`,
            },
          ],
          responseFormat: zodResponseFormat(
            ConcernsResponseType,
            "validateAddress"
          ),
        },
      ];

      const response = await askRepeatedly({
        systemContent,
        runs: userContent as RunType[],
        userId: req.userId,
        functionName: "checkCountry",
      });

      const { isValid } = response;

      if (!isValid) {
        res.status(200).json({ error: "Invalid country" });
        return;
      }

      await doWithRetries(async () =>
        db.collection("User").updateOne(
          { _id: new ObjectId(req.userId) },
          {
            $set: {
              country: response.country,
            },
          }
        )
      );

      res.status(200).end();
    } catch (error) {
      next(error);
    }
  }
);

export default route;
