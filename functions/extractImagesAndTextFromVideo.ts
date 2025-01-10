import httpError from "@/helpers/httpError.js";
import doWithRetries from "helpers/doWithRetries.js";

type Props = {
  url: string;
  userId: string;
};

export default async function extractImagesAndTextFromVideo({
  url,
  userId,
}: Props) {
  try {
    const response = await doWithRetries(
      async () =>
        fetch(`${process.env.PROCESSING_SERVER_URL}/processVideo`, {
          headers: {
            Authorization: process.env.PROCESSING_SECRET,
            "Content-Type": "application/json",
            UserId: userId,
          },
          method: "POST",
          body: JSON.stringify({ url }),
        }) // don't check network status
    );

    return await response.json();
  } catch (err) {
    throw httpError(err.message, err.status);
  }
}
