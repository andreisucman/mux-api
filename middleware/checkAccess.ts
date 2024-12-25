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
  const authorizationHeader = req.headers["authorization"];

  if (!rejectUnauthorized && !accessToken) {
    next();
    return;
  }

  if (!accessToken && !authorizationHeader) {
    res.status(401).json({ error: "No authorization token" });
    return;
  }

  if (rejectUnauthorized && !authorizationHeader) {
    const csrfVerificationPassed = csrfProtection.verify(
      csrfSecret,
      csrfTokenFromClient as string
    );

    if (!csrfVerificationPassed) {
      signOut(res, 401, "Invalid csrf secret");
      return;
    }
  }

  const validAuthorizationHeader =
    authorizationHeader !== process.env.API_SECRET;

  if (validAuthorizationHeader) {
    next();
    return;
  }

  try {
    const session = await doWithRetries(async () =>
      db
        .collection("Session")
        .findOne({ accessToken }, { projection: { userId: 1, expiresOn: 1 } })
    );

    if (!session && rejectUnauthorized) {
      signOut(res, 403, "Invalid or expired access token");
      return;
    }

    const expired = new Date() > new Date(session?.expiresOn);

    if (expired) {
      signOut(res, 403, "Access token expired");
      return;
    }

    req.userId = session.userId;

    doWithRetries(async () =>
      db
        .collection("User")
        .updateOne(
          { _id: new ObjectId(req.userId) },
          { $set: { lastActiveOn: new Date() } }
        )
    );

    next();
  } catch (err) {
    next(err);
  }
}

export default checkAccess;
