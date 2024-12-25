import httpError from "helpers/httpError.js";
import { adminDb } from "init.js";

type Props = { message: string; isError: boolean; functionName: string };

const addCronLog = async ({ message, isError, functionName }: Props) => {
  try {
    const errorLogsCollection = adminDb.collection("CronLog");

    const newErrorLog = {
      functionName,
      message,
      isError,
      createdAt: new Date(),
    };

    await errorLogsCollection.insertOne(newErrorLog);
  } catch (error) {
    throw httpError(error);
  }
};

export default addCronLog;
