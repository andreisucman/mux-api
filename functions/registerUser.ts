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
  city?: string;
  demographics?: DemographicsType;
  email?: string;
  auth?: string;
  latestStyleAnalysis?: { head: StyleAnalysisType; body: StyleAnalysisType };
};

async function registerUser({
  userId,
  tosAccepted,
  country,
  timeZone,
  fingerprint,
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
      if (timeZone) payload.timeZone = timeZone;
      if (tosAccepted) payload.tosAccepted = tosAccepted;
      if (city) payload.city = city;
      if (country) payload.country = country;
      if (demographics) payload.demographics = demographics;
      if (auth) payload.auth = auth;
      if (latestStyleAnalysis)
        payload.latestStyleAnalysis = latestStyleAnalysis;

      if (Object.keys(payload).length === 0) return { _id: userId };

      await doWithRetries({
        functionToExecute: async () =>
          await db.collection("User").updateOne(
            { _id: new ObjectId(userId) },
            {
              $set: payload,
            },
            { upsert: true }
          ),
        functionName: "registerUser",
      });

      return { _id: userId };
    } else {
      let response: Partial<UserType> = {};

      if (fingerprint) {
        const user = await doWithRetries({
          functionToExecute: async () =>
            await db.collection("User").findOne({ fingerprint }),
          functionName: "registerUser",
        });

        if (user) {
          response = user;
        }
      } else {
        const newUser = {
          ...defaultUser,
          _id: new ObjectId(userId),
          email,
          auth,
          demographics,
          country,
          timeZone,
          city,
          fingerprint,
        };

        const user = await doWithRetries({
          functionToExecute: async () =>
            await db.collection("User").insertOne(newUser),
          functionName: "registerUser",
        });

        response = { ...newUser, _id: user.insertedId };
      }

      return response;
    }
  } catch (err) {
    throw httpError(err);
  }
}

export default registerUser;
