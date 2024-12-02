import express from "express";
import http from "http";
import cors from "cors";
import timeout from "connect-timeout";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import authorize from "routes/authorize.js";
import authenticate from "routes/authenticate.js";
import stripeWebhook from "webhooks/stripeWebhook.js";
import connectWebhook from "webhooks/connectWebhook.js";
import setHeaders from "middleware/setHeaders.js";
import addCsrfProtection from "middleware/addCsrfProtection.js";
import issueCsrfToken from "routes/issueCsrfToken.js";
import checkAccess from "middleware/checkAccess.js";
import getBeforeAfters from "routes/getBeforeAfters.js";
import startTheFlow from "routes/startTheFlow.js";
import { client } from "init.js";

client.connect();

const app = express();
app.set("trust proxy", 1);

const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(","),
  methods: ["GET", "POST", "OPTIONS", "HEAD"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-CSRF-Token",
    "Access-Control-Allow-Credentials",
  ],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.options("*", cors(corsOptions));

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/stripeWebhook", stripeWebhook);
app.use("/connectWebhook", connectWebhook);

app.use(cookieParser());
app.use(express.json({ limit: "35mb" }));
app.use(express.urlencoded({ limit: "35mb", extended: true }));

app.use("*", setHeaders);
app.use("*", addCsrfProtection);

app.use(limiter);
app.use(timeout("2m"));

app.use("/authorize", authorize);
app.use("/authenticate", authenticate);
app.use("/issueCsrfToken", issueCsrfToken);
app.use("/getBeforeAfters", getBeforeAfters);
app.use("/startTheFlow", startTheFlow);

app.get("/", (req, res) => {
  res.status(200).json({ message: "/" });
});

app.use(checkAccess);
// protected routes here

const port = process.env.PORT || 3001;
const httpServer = http.createServer(app);
httpServer.listen(port, () => {
  console.log(`Server running on port ${port}.`);
});
