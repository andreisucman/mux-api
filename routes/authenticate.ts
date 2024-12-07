import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { db, stripe } from "init.js";
import { daysFrom } from "helpers/utils.js";
import doWithRetries from "helpers/doWithRetries.js";
import createUser from "@/functions/createUser.js";
import checkIfUserExists from "functions/checkIfUserExists.js";
import getUsersCountry from "functions/getUsersCountry.js";
import { CustomRequest, UserType } from "types.js";
import sendConfirmationCode from "@/functions/sendConfirmationCode.js";
import { getHashedPassword } from "helpers/utils.js";
import createCsrf from "@/functions/createCsrf.js";
import { defaultUser } from "@/data/defaultUser.js";
import getOAuthAuthenticationData from "@/functions/getOAuthAuthenticationData.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      let { code, email, password, state, localUserId, timeZone } = req.body;

      let userData = null;
      let accessToken = crypto.randomBytes(32).toString("hex");
      let finalEmail = email;
      let finalPassword;
      const auth = code ? "g" : "e";

      const { country, city } = await getUsersCountry(req);

      const checkUserPresenceFilter: { [key: string]: any } = { auth };

      if (finalEmail) checkUserPresenceFilter.email = finalEmail;
      if (localUserId) checkUserPresenceFilter._id = new ObjectId(localUserId);

      if (code) {
        const { email, accessToken: googleAccessToken } =
          await getOAuthAuthenticationData({
            code,
            state,
          });

        if (email) {
          checkUserPresenceFilter.email = email;
        }
        accessToken = googleAccessToken;
        finalEmail = email;
      }

      const userInfo = await checkIfUserExists({
        filter: checkUserPresenceFilter,
      });

      if (userInfo) {
        const { _id: userId, email, password: storedPassword } = userInfo;

        if (email) {
          const loginSuccess = await bcrypt.compare(password, storedPassword);
          if (!loginSuccess) {
            res.status(200).json({ error: "The password is incorrect." });
            return;
          }
        } else {
          const { stripeUserId } = userInfo;

          const updatePayload: Partial<UserType> = { email };

          if (!stripeUserId) {
            const stripeUser = await stripe.customers.create({ email });
            updatePayload.stripeUserId = stripeUser.id;
          }

          await doWithRetries(() =>
            db
              .collection("User")
              .updateOne({ _id: new ObjectId(userId) }, { $set: updatePayload })
          );
        }
      } else {
        if (auth === "e") {
          if (!finalPassword) {
            res.status(200).json({ error: "You need to provide a password." });
            return;
          }
          finalPassword = await getHashedPassword(password);
        }

        const stripeUser = await stripe.customers.create({ email });

        userData = await createUser({
          ...defaultUser,
          _id: localUserId,
          password: finalPassword,
          email,
          city,
          country,
          timeZone,
          stripeUserId: stripeUser.id,
        });

        if (auth === "e") {
          await sendConfirmationCode({ userId: localUserId, email });
        }
      }

      const sessionExpiry = daysFrom({ days: 720 });

      await doWithRetries(
        async () =>
          await db.collection("Session").insertOne({
            userId: new ObjectId(userData._id),
            createdAt: new Date(),
            accessToken: accessToken,
            expiresOn: sessionExpiry,
          })
      );

      const { csrfToken, csrfSecret } = createCsrf();

      res.cookie("MUX_csrfSecret", csrfSecret, {
        // domain: ".muxout.com",
        expires: sessionExpiry,
        httpOnly: false,
        secure: true,
        sameSite: "none",
      });

      res.cookie("MUX_csrfToken", csrfToken, {
        // domain: ".muxout.com",
        expires: sessionExpiry,
        secure: true,
        sameSite: "none",
      });

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

      res.json({ message: userData });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
