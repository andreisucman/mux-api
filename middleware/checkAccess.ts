import * as dotenv from "dotenv";
dotenv.config();

import { Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import csrf from "csrf";
import { db } from "init.js";
import signOut from "functions/signOut.js";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";

const csrfProtection = new csrf();

async function checkAccess(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
  rejectUnauthorized: boolean
) {
  const accessToken = req.cookies["MUX_accessToken"];
  const csrfTokenFromClient = req.cookies["MUX_csrfToken"];
  const csrfSecret = req.cookies["MUX_csrfSecret"];

  if (!rejectUnauthorized && !accessToken) {
    next();
    return;
  }

  if (!accessToken) {
    res.status(401).json({ error: "No authorization token" });
    return;
  }

  if (rejectUnauthorized) {
    const csrfVerificationPassed = csrfProtection.verify(
      csrfSecret,
      csrfTokenFromClient as string
    );

    if (!csrfVerificationPassed) {
      signOut(res, 401, "Invalid csrf secret");
      return;
    }
  }

  try {
    const session = await doWithRetries(
      async () =>
        await db.collection("Session").findOne(
          {
            accessToken,
          },
          { projection: { userId: 1, expiresOn: 1 } }
        )
    );

    if (!session && rejectUnauthorized) {
      signOut(res, 403, "Invalid access token");
      return;
    }

    const expired = new Date() > new Date(session?.expiresOn);

    if (expired && rejectUnauthorized) {
      signOut(res, 403, "Access token expired");
      return;
    }

    if (!expired) {
      req.userId = session?.userId;

      doWithRetries(async () =>
        db
          .collection("User")
          .updateOne(
            { _id: new ObjectId(req.userId) },
            { $set: { lastActiveOn: new Date() } }
          )
      );
    }

    next();
  } catch (err) {
    next(err);
  }
}

export default checkAccess;
