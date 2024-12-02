import * as dotenv from "dotenv";
import { Response, NextFunction } from "express";
import csrf from "csrf";
dotenv.config();

import { db } from "init.js";
import signOut from "functions/signOut.js";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";

const csrfProtection = new csrf();

async function checkAccess(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  const accessToken = req.cookies["MYO_accessToken"];
  const csrfTokenFromClient = req.cookies["MYO_csrfToken"];
  const csrfSecret = req.cookies["MYO_csrfSecret"];
  const bearerToken = req.headers["authorization"];
  const csrfTokenFromClientHeader = req.headers["X-CSRF-Token"];
  const csrfFromClient = csrfTokenFromClient || csrfTokenFromClientHeader;

  if (!accessToken && !bearerToken) {
    res.status(401).json({ message: "Access denied: No authorization token." });
    return;
  }

  if (accessToken) {
    if (!csrfProtection.verify(csrfSecret, csrfFromClient as string)) {
      signOut(res, 403);
      return;
    }
  }

  if (bearerToken) {
    const secret = bearerToken.split(" ")[1];
    const correct = process.env.API_SECRET === secret;

    if (correct) {
      next();
    } else {
      res.status(403).send({ message: "Access denied: Invalid secret." });
      return;
    }
  }

  try {
    const session = await doWithRetries({
      functionName: "checkAccess",
      functionToExecute: async () =>
        await db.collection("Session").findOne(
          {
            accessToken,
          },
          { projection: { userId: 1, expiresOn: 1 } }
        ),
    });

    if (!session || !session?.userId) {
      signOut(res, 403);
      return;
    }

    const expired = new Date(session.expiresOn) < new Date();
    if (expired) {
      signOut(res, 403);
      return;
    }

    req.userId = session.userId;
    next();
  } catch (err) {
    console.error("An error occurred:", err);
    res.status(500).json({ error: "An internal error occurred" });
  }
}

export default checkAccess;
