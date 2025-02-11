import httpError from "@/helpers/httpError.js";
import { CookieOptions } from "express";
import doWithRetries from "helpers/doWithRetries.js";

type Props = {
  cookies: CookieOptions;
  url: string;
};

export default async function extractImagesAndTextFromVideo({
  cookies,
  url,
}: Props) {
  try {
    const cookieString = Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");

    const response = await doWithRetries(
      async () =>
        fetch(`${process.env.PROCESSING_SERVER_URL}/processVideo`, {
          headers: {
            "Content-Type": "application/json",
            Cookie: cookieString,
          },
          method: "POST",
          credentials: "include",
          body: JSON.stringify({ url }),
        }) // don't check network status
    );

    return await response.json();
  } catch (err) {
    throw httpError(err);
  }
}
