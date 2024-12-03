import * as dotenv from "dotenv";
dotenv.config();

import { Response, NextFunction } from "express";
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
  const accessToken = req.cookies["MYO_accessToken"];
  const csrfTokenFromClient = req.cookies["MYO_csrfToken"];
  const csrfSecret = req.cookies["MYO_csrfSecret"];
  const bearerToken = req.headers["authorization"];
  const csrfTokenFromClientHeader = req.headers["X-CSRF-Token"];
  const csrfFromClient = csrfTokenFromClient || csrfTokenFromClientHeader;

  const csrfVerificationPassed = !csrfProtection.verify(
    csrfSecret,
    csrfFromClient as string
  );

  if (!csrfVerificationPassed) {
    res.status(401).json({ error: "Invalid csrf secret" });
    return;
  }

  if (!rejectUnauthorized && !accessToken && !bearerToken) {
    next();
    return;
  }

  if (!accessToken && !bearerToken) {
    res.status(401).json({ error: "No authorization token" });
    return;
  }

  if (bearerToken) {
    const secret = bearerToken.split(" ")[1];
    const bearerIsValid = process.env.API_SECRET === secret;

    if (!bearerIsValid) {
      res.status(403).json({ error: "Invalid access token" });
      return;
    }

    next();
    return;
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

    const expired = new Date(session.expiresOn) < new Date();

    if (expired && rejectUnauthorized) {
      signOut(res, 403, "Access token expired");
      return;
    }

    if (!expired) req.userId = session.userId;
    next();
  } catch (err) {
    next(err);
  }
}

export default checkAccess;
