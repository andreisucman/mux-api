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
import getUsersCountry from "@/helpers/getUsersCountry.js";
import { CustomRequest, ModerationStatusEnum, UserType } from "types.js";
import sendConfirmationCode from "@/functions/sendConfirmationCode.js";
import { getHashedPassword } from "helpers/utils.js";
import createCsrf from "@/functions/createCsrf.js";
import { defaultUser } from "@/data/defaultUser.js";
import getUserData from "@/functions/getUserData.js";
import getOAuthAuthenticationData from "@/functions/getOAuthAuthenticationData.js";
import updateAnalytics from "@/functions/updateAnalytics.js";

const route = Router();

const allowedReferrers = [
  "scanFood",
  "analysisStyleResult",
  "analysisProgress",
  "clubRoutines",
  "clubAbout",
  "clubProgress",
  "clubStyle",
  "clubProof",
  "clubDiary",
  "authPage",
  "scanIndex",
];

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      let { code, timeZone, localUserId, referrer, state, email, password } =
        req.body;

      if (!allowedReferrers.includes(referrer)) {
        res.status(400).json({ error: "Bad request" });
        return;
      }

      let userData = null;
      let accessToken = crypto.randomBytes(32).toString("hex");
      let finalEmail = email;
      const auth = code ? "g" : "e";

      const { country, city } = await getUsersCountry(req);

      const parsedState = state
        ? JSON.parse(decodeURIComponent(state as string))
        : {};

      const { redirectPath } = parsedState;

      if (code) {
        const { email, accessToken: googleAccessToken } =
          await getOAuthAuthenticationData({
            code,
            redirectPath,
          });

        accessToken = googleAccessToken;
        finalEmail = email;
      }

      const checkUserPresenceFilter: { [key: string]: any } = {};

      if (localUserId) {
        checkUserPresenceFilter._id = new ObjectId(localUserId);
      } else {
        if (finalEmail) {
          checkUserPresenceFilter.email = finalEmail;
        }
      }

      const userInfo = await checkIfUserExists({
        filter: checkUserPresenceFilter,
      });

      if (userInfo) {
        if (
          userInfo.moderationStatus === ModerationStatusEnum.BLOCKED ||
          userInfo.moderationStatus === ModerationStatusEnum.SUSPENDED
        ) {
          res.status(200).json({
            error: userInfo.moderationStatus,
          });
          return;
        }
        // if the registration happens as a result of the analysis
        userData = userInfo;

        const { _id: userId, email, password: storedPassword } = userInfo;

        if (email) {
          if (auth === "e") {
            const loginSuccess = await bcrypt.compare(password, storedPassword);
            if (!loginSuccess) {
              res.status(200).json({ error: "The password is incorrect." });
              return;
            }
          }
        } else {
          const { stripeUserId } = userInfo;

          const updatePayload: Partial<UserType> = {
            auth,
            email: finalEmail,
            emailVerified: auth === "g",
          };

          if (!stripeUserId) {
            const stripeUser = await stripe.customers.create({
              email: finalEmail,
            });
            updatePayload.stripeUserId = stripeUser.id;
          }

          await doWithRetries(() =>
            db.collection("User").updateOne(
              {
                _id: new ObjectId(userId),
                moderationStatus: ModerationStatusEnum.ACTIVE,
              },
              { $set: updatePayload }
            )
          );

          userData = await getUserData({ userId: String(userId) });

          if (auth === "e") {
            await sendConfirmationCode({ userId: String(userData._id), email });
          }
        }

        updateAnalytics({
          [`overview.acquisition.signins.${referrer}`]: 1,
        });
      } else {
        // if the registration happes from the sign in page
        if (auth === "e") {
          if (!password) {
            res.status(200).json({ error: "You need to provide a password." });
            return;
          }
        }

        const hashedPassword = await getHashedPassword(password);

        const stripeUser = await stripe.customers.create({ email: finalEmail });

        userData = await createUser({
          ...defaultUser,
          _id: localUserId,
          password: hashedPassword,
          email: finalEmail,
          city,
          auth,
          country,
          timeZone,
          emailVerified: auth === "g",
          stripeUserId: stripeUser.id,
        });

        if (auth === "e") {
          await sendConfirmationCode({ userId: String(userData._id), email });
        }

        updateAnalytics({
          "overview.user.registeredUsers": 1,
          [`overview.acquisition.signups.${referrer}`]: 1,
        });
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
