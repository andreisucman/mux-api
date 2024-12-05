import { ObjectId } from "mongodb";
import { db, stripe } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import { defaultUser } from "data/defaultUser.js";
import { DemographicsType, StyleAnalysisType, UserType } from "types.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId?: ObjectId | string;
  tosAccepted?: boolean;
  country?: string;
  fingerprint?: number;
  timeZone: string;
  password?: string;
  city?: string;
  demographics?: DemographicsType;
  email?: string;
  auth?: string;
  latestStyleAnalysis?: { head: StyleAnalysisType; body: StyleAnalysisType };
};

type RegisterNewUserProps = {
  userId?: ObjectId | string;
  tosAccepted?: boolean;
  country?: string;
  city?: string;
  fingerprint?: number;
  timeZone: string;
  password?: string;
  demographics?: DemographicsType;
  email?: string;
  auth?: string;
  latestStyleAnalysis?: { head: StyleAnalysisType; body: StyleAnalysisType };
};

async function registerNewUser({
  userId,
  email,
  auth,
  password,
  demographics,
  country,
  city,
  timeZone,
  fingerprint,
  tosAccepted,
}: RegisterNewUserProps) {
  try {
    const newUser = {
      ...defaultUser,
      _id: new ObjectId(userId),
      email,
      auth,
      demographics,
      country,
      city,
      timeZone,
      password,
      tosAccepted,
      fingerprint,
    };

    const user = await doWithRetries(
      async () => await db.collection("User").insertOne(newUser)
    );

    return { ...newUser, _id: user.insertedId };
  } catch (err) {
    throw httpError(err);
  }
}

async function registerUser({
  userId,
  tosAccepted,
  country,
  timeZone,
  fingerprint,
  password,
  city,
  demographics,
  email,
  auth,
  latestStyleAnalysis,
}: Props) {
  try {
    /* if this is a registration from register card, associate the existing user with the email */
    if (userId) {
      const payload = { ...defaultUser } as UserType;

      if (email) {
        const stripeUser = await stripe.customers.create({ email });
        payload.email = email;
        payload.stripeUserId = stripeUser.id;
      }
      if (password) payload.password = password;
      if (timeZone) payload.timeZone = timeZone;
      if (tosAccepted) payload.tosAccepted = tosAccepted;
      if (city) payload.city = city;
      if (country) payload.country = country;
      if (demographics) payload.demographics = demographics;
      if (auth) payload.auth = auth;
      if (latestStyleAnalysis)
        payload.latestStyleAnalysis = latestStyleAnalysis;

      if (Object.keys(payload).length === 0) return { _id: userId };

      await doWithRetries(
        async () =>
          await db.collection("User").updateOne(
            { _id: new ObjectId(userId) },
            {
              $set: payload,
            },
            { upsert: true }
          )
      );

      return { _id: userId };
    } else {
      let response: Partial<UserType> = {};

      if (fingerprint) {
        const user = await doWithRetries(
          async () => await db.collection("User").findOne({ fingerprint })
        );

        if (user) {
          response = user;
        } else {
          response = await registerNewUser({
            userId,
            tosAccepted,
            country,
            timeZone,
            fingerprint,
            password,
            city,
            demographics,
            email,
            auth,
          });
        }
      } else {
        response = await registerNewUser({
          userId,
          tosAccepted,
          country,
          timeZone,
          fingerprint,
          password,
          city,
          demographics,
          email,
          auth,
        });
      }

      return response;
    }
  } catch (err) {
    throw httpError(err);
  }
}

export default registerUser;
