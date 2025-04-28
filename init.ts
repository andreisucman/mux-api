import * as dotenv from "dotenv";
dotenv.config();
import Replicate from "replicate";
import { createClient } from "redis";
import Together from "together-ai";
import OpenAI from "openai";
import { MongoClient } from "mongodb";
import { SESClient } from "@aws-sdk/client-ses";
import Stripe from "stripe";
import { S3Client } from "@aws-sdk/client-s3";
import * as promClient from "prom-client";

const client = new MongoClient(process.env.DATABASE_URI);
const db = client.db(process.env.DATABASE_NAME);
const adminDb = client.db(process.env.ADMIN_DATABASE_NAME);
const promClientRegister = new promClient.Registry();

const redis = createClient({ url: process.env.REDIS_URL });
redis
  .connect()
  .then(async () => await redis.configSet("maxmemory-policy", "allkeys-lru"))
  .catch((err) => {
    console.error("Redis connection failed:", err);
    process.exit(1);
  });

const s3Client = new S3Client({
  region: process.env.DO_SPACES_REGION,
  credentials: {
    accessKeyId: process.env.DO_SPACES_ACCESS_KEY,
    secretAccessKey: process.env.DO_SPACES_SECRET_KEY,
  },
  endpoint: process.env.DO_SPACES_ENDPOINT,
});

const sesClient = new SESClient({
  region: process.env.SES_REGION,
  credentials: {
    accessKeyId: process.env.SES_ACCESS_KEY,
    secretAccessKey: process.env.SES_SECRET_KEY,
  },
});

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const deepSeek = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const together = new Together({ apiKey: process.env.TOGETHER_API_KEY });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

global.intervalRef = null;

global.startInterval = (callback: (args: any) => any, delay = 5000) => {
  if (global.intervalRef || delay < 1000) return;
  global.intervalRef = setInterval(callback, delay);
};

global.stopInterval = () => {
  if (global.intervalRef) {
    clearInterval(global.intervalRef);
    global.intervalRef = null;
  }
};

export {
  db,
  redis,
  deepSeek,
  adminDb,
  client,
  s3Client,
  sesClient,
  together,
  openai,
  replicate,
  stripe,
  promClientRegister,
};
