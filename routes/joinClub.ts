import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response } from "express";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import createClubProfile from "functions/createClubProfile.js";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response) => {
  const { avatar } = req.body;
  try {
    const userInfo = await doWithRetries({
      functionName: "joinClub - get user info",
      functionToExecute: async () =>
        db.collection("User").findOne(
          {
            _id: new ObjectId(req.userId),
          },
          { projection: { club: 1 } }
        ),
    });

    let clubData = userInfo.club;

    if (!clubData) {
      clubData = await createClubProfile({
        userId: req.userId,
        avatar,
      });
    }

    res.status(200).json({ message: { club: clubData } });
  } catch (error) {
    addErrorLog({ functionName: "joinClub", message: error.message });
    res.status(500).json({ error: "Server error" });
  }
});

export default route;
