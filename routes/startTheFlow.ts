import * as dotenv from "dotenv";
dotenv.config();
import { Router, Request, Response, NextFunction } from "express";
import getUserData from "functions/getUserData.js";
import doWithRetries from "helpers/doWithRetries.js";
import registerUser from "functions/registerUser.js";
import getUsersCountry from "functions/getUsersCountry.js";
import { UserType } from "types.js";

const route = Router();

route.post("/", async (req: Request, res: Response, next: NextFunction) => {
  const { userId, tosAccepted, timeZone, fingerprint } = req.body;

  try {
    const { country, city } = await getUsersCountry(req);

    const registrationResponse = await doWithRetries({
      functionToExecute: async () =>
        await registerUser({
          userId,
          city,
          country,
          timeZone,
          tosAccepted,
          fingerprint,
        }),
      functionName: "startTheFlow",
    });

    const userData = (await doWithRetries({
      functionName: "startTheFlow - getUserData",
      functionToExecute: async () =>
        getUserData({ userId: String(registrationResponse._id) }),
    })) as unknown as UserType;

    let result = { ...registrationResponse, ...userData };

    res.status(200).json({
      message: result,
    });
  } catch (err) {
    next(err);
  }
});

export default route;
