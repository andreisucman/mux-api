import { ObjectId } from "mongodb";

export default function generateSeed(userId: string) {
  const timestampHex = new ObjectId(userId).toHexString().substring(0, 8);
  const timestamp = parseInt(timestampHex, 16);
  const randomBytesHex = new ObjectId(userId).toHexString().substring(8, 16);
  const randomPart = parseInt(randomBytesHex, 16);
  return timestamp ^ randomPart;
}
