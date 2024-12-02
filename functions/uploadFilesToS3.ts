import * as dotenv from "dotenv";
dotenv.config();

import { nanoid } from "nanoid";
import { PutObjectCommand, ObjectCannedACL } from "@aws-sdk/client-s3";
import { mimeTypeMap } from "data/mimeTypeMap.js";
import addErrorLog from "functions/addErrorLog.js";
import { s3Client } from "init.js";

async function getFileBufferFromUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch the file from URL: ${url}`);
  }
  const contentType = response.headers.get("content-type");
  const buffer = await response.arrayBuffer();
  return { buffer: Buffer.from(buffer), contentType };
}

export default async function uploadFilesToS3(filesOrUrls: string[] | any) {
  try {
    const uploadedUrls = [];

    for (const item of filesOrUrls) {
      let buffer, mimeType, originalname;

      if (typeof item === "string") {
        // If the item is a URL
        const url = item;
        const fetchedFile = await getFileBufferFromUrl(url);
        buffer = fetchedFile.buffer;
        mimeType = fetchedFile.contentType;
        originalname = url.split("/").pop().split("?")[0];
      } else {
        // If the item is a file object
        buffer = item.buffer;
        mimeType = item.mimetype;
        originalname = item.originalname;
      }

      const extension =
        mimeTypeMap[mimeType as "image/png"] || mimeType.split("/")[1];

      const finalKey = `${nanoid()}.${extension}`;

      const uploadParams = {
        Bucket: process.env.DO_SPACES_BUCKET_NAME,
        Key: finalKey,
        Body: buffer,
        ContentType: mimeType,
        ACL: "public-read" as ObjectCannedACL,
      };

      const putObjectCommand = new PutObjectCommand(uploadParams);
      await s3Client.send(putObjectCommand);

      const fileUrl = `https://${process.env.DO_SPACES_BUCKET_NAME}.${
        process.env.DO_SPACES_ENDPOINT.split("https://")[1]
      }/${encodeURIComponent(finalKey)}`;
      uploadedUrls.push(fileUrl);
    }

    return uploadedUrls;
  } catch (err) {
    addErrorLog({ functionName: "uploadFilesToS3", message: err.message });
    throw err;
  }
}
