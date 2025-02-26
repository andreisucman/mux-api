import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { db, stripe } from "init.js";
import { getTimezoneOffset, daysFrom } from "helpers/utils.js";
import doWithRetries from "helpers/doWithRetries.js";
import createUser from "@/functions/createUser.js";
import checkIfUserExists from "functions/checkIfUserExists.js";
import {
  CategoryNameEnum,
  CustomRequest,
  ModerationStatusEnum,
  UserType,
} from "types.js";
import sendConfirmationCode from "@/functions/sendConfirmationCode.js";
import { getHashedPassword } from "helpers/utils.js";
import createCsrf from "@/functions/createCsrf.js";
import { defaultUser } from "@/data/defaultUser.js";
import getUserData from "@/functions/getUserData.js";
import checkIfSuspended from "@/functions/checkIfSuspended.js";
import getOAuthAuthenticationData from "@/functions/getOAuthAuthenticationData.js";
import updateAnalytics from "@/functions/updateAnalytics.js";

const route = Router();

const allowedReferrers = [
  "scanFood",
  "scanProgress",
  "analysisProgress",
  "clubRoutines",
  "clubAbout",
  "clubProgress",
  "clubAnswers",
  "clubProof",
  "clubDiary",
  "authPage",
  "scanIndex",
  "plans",
  "rewards",
];

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      let { code, timeZone, state, email, password } = req.body;

      const parsedState = state
        ? JSON.parse(decodeURIComponent(state as string))
        : {};

      const { localUserId, referrer } = parsedState;

      if (localUserId && !ObjectId.isValid(localUserId)) {
        res.status(400).json({ error: "Bad request" });
        return;
      }

      if (!allowedReferrers.includes(referrer)) {
        res.status(400).json({ error: "Bad request" });
        return;
      }

      const isSuspended = await checkIfSuspended({
        userId: localUserId,
        categoryName: CategoryNameEnum.OTHER,
      });

      if (isSuspended) {
        res.status(200).json({
          error:
            "Sorry, but you can't use the platform. For details contact us at info@muxout.com.",
        });
        return;
      }

      let userData = null;
      let accessToken = crypto.randomBytes(32).toString("hex");
      let finalEmail = email;
      const auth = code ? "g" : "e";

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

      const filter = { $or: [] };

      if (finalEmail) {
        filter.$or.push({ email: finalEmail, auth });
      }

      if (localUserId) {
        filter.$or.push({ _id: new ObjectId(localUserId) });
      }

      const userInfo = await checkIfUserExists({
        filter,
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
        userData = userInfo;

        let { _id: userId, email, password: storedPassword } = userInfo;

        if (email) {
          // login
          const timeZoneOffsetInMinutes = getTimezoneOffset(timeZone);

          const updateObject: { [key: string]: any } = {
            timeZone,
            timeZoneOffsetInMinutes,
          };

          if (auth === "e") {
            const loginSuccess = await bcrypt.compare(password, storedPassword);

            if (!loginSuccess) {
              res.status(200).json({ error: "The password is incorrect." });
              return;
            }
          }

          await doWithRetries(() =>
            db.collection("User").updateOne(
              {
                email,
                auth,
              },
              { $set: updateObject }
            )
          );

          updateAnalytics({
            userId: req.userId,
            incrementPayload: {
              [`overview.acquisition.signIn.${parsedState.referrer}`]: 1,
            },
          });

          userData = await getUserData({ userId: String(userId) });
        } else {
          // registration after the analysis
          const { stripeUserId } = userInfo;

          const updatePayload: Partial<UserType> = {
            auth,
            email: finalEmail,
            emailVerified: auth === "g",
          };

          if (auth === "e") {
            if (!storedPassword) {
              storedPassword = await getHashedPassword(password);
              updatePayload.password = storedPassword;
            }
          }

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
            await sendConfirmationCode({
              userId: String(userData._id),
              email: finalEmail,
            });
          }
        }

        updateAnalytics({
          userId: req.userId,
          incrementPayload: {
            [`overview.acquisition.signUps.${parsedState.referrer}`]: 1,
          },
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
          auth,
          timeZone,
          emailVerified: auth === "g",
          stripeUserId: stripeUser.id,
        });

        if (auth === "e") {
          await sendConfirmationCode({
            userId: String(userData._id),
            email: finalEmail,
          });
        }

        updateAnalytics({
          userId: req.userId,
          incrementPayload: {
            "overview.user.count.registeredUsers": 1,
            [`overview.acquisition.signUps.${parsedState.referrer}`]: 1,
          },
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

      const domain = process.env.ENV === "dev" ? undefined : ".muxout.com";

      res.cookie("MUX_csrfSecret", csrfSecret, {
        domain,
        expires: sessionExpiry,
        httpOnly: false,
        secure: true,
        sameSite: "none",
      });

      res.cookie("MUX_csrfToken", csrfToken, {
        domain,
        expires: sessionExpiry,
        secure: true,
        sameSite: "none",
      });

      res.cookie("MUX_accessToken", accessToken, {
        domain,
        expires: sessionExpiry,
        httpOnly: true,
        secure: true,
        sameSite: "none",
      });

      res.cookie("MUX_isLoggedIn", true, {
        domain,
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
