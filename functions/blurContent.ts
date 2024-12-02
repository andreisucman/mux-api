import * as dotenv from "dotenv";
dotenv.config();

import { BlurTypeEnum } from "types.js";
import addErrorLog from "functions/addErrorLog.js";

type Props = {
  originalUrl: string;
  blurType: BlurTypeEnum;
  endpoint: "blurImage" | "blurVideo";
};

export default async function blurContent({
  originalUrl,
  blurType,
  endpoint,
}: Props) {
  try {
    const response = await fetch(
      `${process.env.PROCESSING_SERVER_URL}/${endpoint}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: originalUrl,
          blurType,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Server Error: ${errorData.message}`);
    }

    const data = await response.json();

    return data.message;
  } catch (err) {
    addErrorLog({ functionName: "blurContent", message: err.message });
    throw err;
  }
}
