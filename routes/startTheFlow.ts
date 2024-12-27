import * as dotenv from "dotenv";
dotenv.config();
import { Router, Request, Response, NextFunction } from "express";
import getUserData from "functions/getUserData.js";
import doWithRetries from "helpers/doWithRetries.js";
import getUsersCountry from "@/helpers/getUsersCountry.js";
import checkIfUserExists from "@/functions/checkIfUserExists.js";
import createUser from "@/functions/createUser.js";
import { db } from "init.js";
import { UserType } from "types.js";

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

    const fingerprintIsSupended = await doWithRetries(async () =>
      db.collection("SuspendedFingerprint").findOne({ fingerprint })
    );

    if (fingerprintIsSupended) {
      res.status(200).json({
        error:
          "Sorry, but you can't use our platform due to your violations of our TOS in the past. If you think this is a mistake contact us at info@muxout.com",
      });
      return;
    }

    let userData = await checkIfUserExists({ filter: { fingerprint } });

    if (userData) {
      res.status(200).json({
        message: userData,
      });
      return;
    }

    const { country, city } = await getUsersCountry(req);

    const createUserResponse = await doWithRetries(
      async () =>
        await createUser({
          city,
          country,
          timeZone,
          tosAccepted,
          fingerprint,
        })
    );

    userData = (await doWithRetries(async () =>
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
