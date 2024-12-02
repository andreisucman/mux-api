import { db } from "init.js";

type Props = { message: string; functionName: string };

const addErrorLog = async ({ message, functionName }: Props) => {
  try {
    const errorLogsCollection = db.collection("ErrorLog");

    const newErrorLog = {
      functionName,
      message,
      createdAt: new Date(),
    };

    await errorLogsCollection.insertOne(newErrorLog);
    console.log(`Error in ${functionName}: `, message);

    return true;
  } catch (error) {
    throw new Error(`Error thrown in addErrorLog: ${error.message}`);
  }
};

export default addErrorLog;
