import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { db, stripe } from "init.js";
import { daysFrom } from "helpers/utils.js";
import getUserData from "functions/getUserData.js";
import getGoogleToken from "functions/getGoogleToken.js";
import doWithRetries from "helpers/doWithRetries.js";
import checkIfUserExists from "functions/checkIfUserExists.js";
import registerUser from "functions/registerUser.js";
import getUsersCountry from "functions/getUsersCountry.js";
import { CustomRequest, UserType } from "types.js";
import sendConfirmationCode from "@/functions/sendConfirmationCode.js";
import { getHashedPassword } from "helpers/utils.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      let { code, email, password, state, localUserId, timeZone } = req.body;

      const parsedState = state
        ? JSON.parse(decodeURIComponent(state as string))
        : {};

      const { redirectTo } = parsedState;

      const redirectUrl =
        redirectTo === "pricing"
          ? process.env.PRICING_REDIRECT_URI
          : redirectTo === "track"
          ? process.env.TRACK_REDIRECT_URI
          : process.env.ROUTINE_REDIRECT_URI;

      let authData = null;
      let auth = code ? "g" : "e";
      let accessToken = crypto.randomBytes(32).toString("hex");

      if (auth === "g") {
        authData = await getGoogleToken(code, redirectUrl);

        if (!authData) {
          throw httpError("Failed to get Google token");
        }

        email = authData.email;
        accessToken = authData.accessToken;
      }

      /* When localUserId is provided it means this is the 2nd step of the registration, which means the data of the user already exists and only email and password need to be added */
      let userId = localUserId;

      const checkIfUserExistsResponse = await checkIfUserExists({
        email,
        auth,
      });

      if (!userId) {
        userId = checkIfUserExistsResponse.userId;
      }

      if (!userId) {
        const { country, city } = await getUsersCountry(req);

        const hashedPassword = await getHashedPassword(password);

        /* if the account doesn't exist and this is the initial call for registration */
        const payload = {
          email,
          auth,
          timeZone,
          country,
          city,
          emailVerified: auth === "g",
          password: hashedPassword,
        };

        const registerResponse = await doWithRetries(
          async () => await registerUser(payload)
        );

        userId = registerResponse._id;

        if (!payload.emailVerified) {
          await sendConfirmationCode({ userId });
        }
      } else if (localUserId) {
        /* if the account exists, but registration is not finished, this is a second call to finish registration */
        if (email) {
          const hashedPassword = await getHashedPassword(password);
          const stripeUser = await stripe.customers.create({ email });

          const payload: Partial<UserType> = {
            email,
            timeZone,
            stripeUserId: stripeUser.id,
            emailVerified: auth === "g",
            password: hashedPassword,
          };

          await doWithRetries(async () =>
            db.collection("User").updateOne(
              { _id: new ObjectId(userId) },
              {
                $set: payload,
              }
            )
          );

          if (!payload.emailVerified) {
            await sendConfirmationCode({ userId });
          }
        }
      } else {
        // login drops here

        if (password) {
          const storedPassword = checkIfUserExistsResponse.password;
          const passwordsMatch = await bcrypt.compare(password, storedPassword);

          if (!passwordsMatch) {
            res.status(200).json({ error: "Password is incorrect." });
            return;
          }
        }
      }

      const sessionExpiry = daysFrom({ days: 720 });

      await doWithRetries(
        async () =>
          await db.collection("Session").insertOne({
            userId: new ObjectId(userId),
            createdAt: new Date(),
            accessToken: accessToken,
            expiresOn: sessionExpiry,
          })
      );

      const userData = await getUserData({ userId });

      res.cookie("MUX_accessToken", accessToken, {
        // domain: ".muxout.com",
        expires: sessionExpiry,
        httpOnly: true,
        secure: true,
        sameSite: "none",
      });

      res.cookie("MUX_isLoggedIn", true, {
        // domain: ".muxout.com",
        expires: sessionExpiry,
        secure: true,
        sameSite: "none",
      });

      res.status(200).json({ message: userData });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
