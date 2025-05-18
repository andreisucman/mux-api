import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import verifyTurnstileToken from "@/functions/verifyTurnstileToken.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import { db, redis } from "@/init.js";
import getUserInfo from "@/functions/getUserInfo.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { token, fingerprint, part, concern, page, userName } = req.body;
    const ipHeader = req.headers["cf-connecting-ip"] as string;
    const userIP = ipHeader || req.ip;

    try {
      const redisKey = `fp:${fingerprint}-ip:${userIP}-nm:${userName}`;

      const exists = await redis.get(redisKey);

      if (exists) {
        res.status(200).end();
        return;
      }

      const tokenIsValid = await verifyTurnstileToken(token, userIP);
      const userInfo = await getUserInfo({
        userName,
        projection: { _id: 1, "club.payouts.connectId": 1 },
      });

      if (tokenIsValid) {
        await doWithRetries(() =>
          db.collection("View").updateOne(
            {
              userId: userInfo._id,
              connectId: userInfo.club.payouts.connectId,
              userName,
              part,
              concern,
              page,
            },
            { $inc: { views: 1 } },
            { upsert: true }
          )
        );
        await redis.set(redisKey, 1, "EX", 43200);
      }

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
