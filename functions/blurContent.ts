import * as dotenv from "dotenv";
dotenv.config();

import { CookieOptions } from "express";
import httpError from "@/helpers/httpError.js";
import { BlurTypeEnum } from "types.js";

type Props = {
  cookies: CookieOptions;
  originalUrl: string;
  blurType: BlurTypeEnum;
  endpoint: "blurImageManually" | "blurVideo";
};

export default async function blurContent({ originalUrl, blurType, endpoint, cookies }: Props) {
  try {
    const cookieString = Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");

    const response = await fetch(`${process.env.PROCESSING_SERVER_URL}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieString,
      },
      body: JSON.stringify({
        url: originalUrl,
        blurType,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw httpError(`Server Error: ${errorData.message}`);
    }

    const data = await response.json();

    return data.message;
  } catch (err) {
    throw httpError(err);
  }
}
