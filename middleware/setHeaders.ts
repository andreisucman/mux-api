import { CustomRequest } from "types.js";
import { Response, NextFunction } from "express";
import * as dotenv from "dotenv";
dotenv.config();

function setHeaders(req: CustomRequest, res: Response, next: NextFunction) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS.split(",");

  const origin = req.get("origin");

  if (allowedOrigins.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }

  const formattedOrigins = process.env.ALLOWED_ORIGINS.split(",").join(" ");

  res.set(
    "Content-Security-Policy",
    `default-src 'self' ${formattedOrigins}; script-src 'self'; style-src 'self'; font-src https://fonts.googleapis.com https://fonts.gstatic.com; style-src-elem 'self' https://fonts.googleapis.com https://fonts.gstatic.com`
  );

  res.set("Access-Control-Allow-Credentials", "true");

  next();
}

export default setHeaders;
