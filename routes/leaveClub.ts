import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response } from "express";
import { CustomRequest } from "types.js";
import addErrorLog from "functions/addErrorLog.js";
import removeFromClub from "functions/removeFromClub.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response) => {
  try {
    await removeFromClub({ userId: req.userId });
    res.status(200).end();
  } catch (error) {
    addErrorLog({ functionName: "leaveClub", message: error.message });
    res.status(500).json({ error: "Unexprected error" });
  }
});

export default route;
