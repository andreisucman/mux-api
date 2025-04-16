import z from "zod";
import { CategoryNameEnum, CustomRequest } from "types.js";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { RunType } from "types/askOpenaiTypes.js";
import askRepeatedly from "functions/askRepeatedly.js";
import { Router, Response, NextFunction } from "express";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { country } = req.body;

    try {
      const systemContent = `The user gives you the name of their country. If this is a valid country return its ISO 3166-1 alpha-2 code. If this is an invalid country return isValid as false and other fields as empty strings.`;

      const CheckCountryResponseType = z.object({
        isValid: z
          .boolean()
          .describe("true if the country is valid and false if not"),
        countryCode: z
          .string()
          .describe(
            "Return the ISO 3166-1 alpha-2 code of the country or empty string if the country is not valid"
          ),
      });

      const userContent = [
        {
          model: "gpt-4o-mini",
          content: [
            {
              type: "text",
              text: `Is this a valid country: ${country}?`,
            },
          ],
          responseFormat: zodResponseFormat(
            CheckCountryResponseType,
            "validateAddress"
          ),
        },
      ];

      const response = await askRepeatedly({
        systemContent,
        categoryName: CategoryNameEnum.OTHER,
        runs: userContent as RunType[],
        userId: req.userId,
        functionName: "checkCountry",
      });

      const { isValid, countryCode } = response;

      if (!isValid) {
        res.status(200).json({ error: "Invalid country." });
        return;
      }

      res.status(200).json({ message: countryCode });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
