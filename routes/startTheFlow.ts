import * as dotenv from "dotenv";
dotenv.config();
import { Router, Request, Response, NextFunction } from "express";
import getUserData from "functions/getUserData.js";
import doWithRetries from "helpers/doWithRetries.js";
import createUser from "@/functions/createUser.js";
import generateIpAndNumberFingerprint from "@/functions/generateIpAndNumberFingerprint.js";
import { UserType } from "types.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

type Props = {
  tosAccepted: boolean;
  timeZone: string;
  fingerprint: number;
};

route.post("/", async (req: Request, res: Response, next: NextFunction) => {
  const { tosAccepted, timeZone, fingerprint }: Props = req.body;

  try {
    if (!fingerprint) {
      res.status(200).json({
        error:
          "Sorry, but your device is not supported. Try again using a different device.",
      });
      return;
    }

    const ipFingerprint = generateIpAndNumberFingerprint(
      req.ip || req.socket.remoteAddress,
      fingerprint
    );

    const createUserResponse = await doWithRetries(
      async () =>
        await createUser({
          timeZone,
          tosAccepted,
          ipFingerprint,
        })
    );

    const userData = (await doWithRetries(async () =>
      getUserData({ userId: String(createUserResponse._id) })
    )) as unknown as UserType;

    res.status(200).json({
      message: { ...createUserResponse, ...userData },
    });
  } catch (err) {
    next(err);
  }
});

export default route;
