import * as dotenv from "dotenv";
dotenv.config();
import Replicate from "replicate";
import Together from "together-ai";
import OpenAI from "openai";
import path from "path";
import { MongoClient } from "mongodb";
import { SESClient } from "@aws-sdk/client-ses";
import Stripe from "stripe";
import { S3Client } from "@aws-sdk/client-s3";
import { fileURLToPath } from "url";

const client = new MongoClient(process.env.DATABASE_URI);
const db = client.db(process.env.DATABASE_NAME);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const together = new Together({ apiKey: process.env.TOGETHER_API_KEY });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export {
  client,
  db,
  s3Client,
  sesClient,
  together,
  openai,
  __dirname,
  replicate,
  stripe,
};
