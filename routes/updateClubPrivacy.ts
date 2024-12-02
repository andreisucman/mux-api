import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response } from "express";
import updateContentPublicity from "functions/updateContentPublicity.js";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";
import { db } from "init.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response) => {
  const { privacy } = req.body;

  try {
    const userInfo = await doWithRetries({
      functionName: "updateClubPrivacy",
      functionToExecute: async () =>
        db
          .collection("User")
          .findOne(
            { _id: new ObjectId(req.userId) },
            { projection: { club: 1 } }
          ),
    });

    if (!userInfo) throw new Error(`User ${req.userId} not found`);
    if (!userInfo.club) throw new Error(`User ${req.userId} is not in the club`);

    const { club } = userInfo;
    const { payouts } = club;
    const { payoutsEnabled } = payouts;

    if (!payoutsEnabled) {
      res.status(200).json({
        error: `You can turn on data sharing after your bank account is approved. To add a bank account or see it's verification status login to your wallet.`,
      });
      return;
    }

    updateContentPublicity({ userId: req.userId, newPrivacy: privacy });

    res.status(200).end();
  } catch (error) {
    addErrorLog({
      functionName: "updateClubPrivacy",
      message: error.message,
    });
  }
});

export default route;
