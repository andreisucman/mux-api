import * as dotenv from "dotenv";
dotenv.config();

import { Router } from "express";
import { ObjectId } from "mongodb";
import { db, stripe } from "init.js";
import { daysFrom } from "helpers/utils.js";
import getUserData from "functions/getUserData.js";
import addErrorLog from "functions/addErrorLog.js";
import getGoogleToken from "functions/getGoogleToken.js";
import doWithRetries from "helpers/doWithRetries.js";
import checkIfUserExists from "functions/checkIfUserExists.js";
import registerUser from "functions/registerUser.js";
import getUsersCountry from "functions/getUsersCountry.js";
import { CustomRequest, UserType } from "types.js";
import { AuthDataType } from "@/types/authenticateTypes.js";

const route = Router();

route.post("/", async (req: CustomRequest, res) => {
  try {
    let { code, state, localUserId, timeZone } = req.body;

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

    const authData = await getGoogleToken(code, redirectUrl);

    if (!authData) {
      throw new Error("Failed to get Google token");
    }

    const { email, accessToken } = authData as AuthDataType;

    /* When localUserId is provided it means this is the 2nd step of the registration, which means the data of the user already exists and only email needs to be added */
    let userId = localUserId;

    if (!userId) {
      const checkResponse = await checkIfUserExists({ email, auth: "g" });
      userId = checkResponse.userId;
    }

    if (!userId) {
      const { country, city } = await getUsersCountry(req);

      /* if the account doesn't exist and this is the initial call for registration */
      const payload = {
        email,
        auth: "g",
        timeZone,
        country,
        city,
      };

      const registerResponse = await doWithRetries({
        functionToExecute: async () => await registerUser(payload),
        functionName: "authenticate",
      });

      userId = registerResponse._id;
    } else if (localUserId) {
      /* if the account exists, but registration is not finished, this is a second call to finish registration */
      if (email) {
        const payload: Partial<UserType> = { timeZone };

        const stripeUser = await stripe.customers.create({ email });
        payload.email = email;
        payload.stripeUserId = stripeUser.id;

        await doWithRetries({
          functionToExecute: async () =>
            db.collection("User").updateOne(
              { _id: new ObjectId(userId) },
              {
                $set: payload,
              }
            ),
          functionName: "authenticate - update referredById",
        });
      }
    } else {
      // normal login drops here
    }

    const sessionExpiry = daysFrom({ days: 720 });

    await doWithRetries({
      functionToExecute: async () =>
        await db.collection("Session").insertOne({
          userId: new ObjectId(userId),
          createdAt: new Date(),
          accessToken: accessToken,
          expiresOn: sessionExpiry,
        }),
      functionName: "authenticate - add session",
    });

    const userData = await getUserData({ userId });

    res.cookie("MYO_accessToken", accessToken, {
      // domain: ".muxout.com",
      expires: sessionExpiry,
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });

    res.cookie("MYO_isLoggedIn", true, {
      // domain: ".muxout.com",
      expires: sessionExpiry,
      secure: true,
      sameSite: "none",
    });

    res.status(200).json({ message: userData });
  } catch (error) {
    addErrorLog({ functionName: "authenticate", message: error.message });
    res.status(500).json({ error: "An unexpected error occurred" });
  }
});

export default route;
