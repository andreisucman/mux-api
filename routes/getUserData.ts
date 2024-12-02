import { Router, Response } from "express";
import { CustomRequest } from "types.js";
import addErrorLog from "functions/addErrorLog.js";
import getUserData from "functions/getUserData.js";
import doWithRetries from "helpers/doWithRetries.js";

const route = Router();

route.get("/", async (req: CustomRequest, res: Response) => {
  try {
    if (!req.userId) {
      addErrorLog({
        functionName: "getUserData",
        message: "No user",
      });
      res.status(400).end();
      return;
    }

    const userData = await doWithRetries({
      functionName: "getUserData",
      functionToExecute: async () => await getUserData({ userId: req.userId }),
    });

    res.status(200).json({ message: userData });
  } catch (error) {
    addErrorLog({
      functionName: "getUserData",
      message: error.message,
    });

    res.status(500).json({ error: "An unexpected error occurred" });
  }
});

export default route;
