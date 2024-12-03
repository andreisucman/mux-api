import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import createClubProfile from "functions/createClubProfile.js";
import doWithRetries from "helpers/doWithRetries.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
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
    } catch (err) {
      next(err);
    }
  }
);

export default route;
