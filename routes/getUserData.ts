import { Router, Response, NextFunction } from "express";
import { CustomRequest, ModerationStatusEnum } from "types.js";
import getUserData from "functions/getUserData.js";
import doWithRetries from "helpers/doWithRetries.js";
import signOut from "@/functions/signOut.js";

const route = Router();

route.get(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
      const userData = await doWithRetries(
        async () => await getUserData({ userId: req.userId })
      );

      if (userData === null) {
        signOut(res, 404, "Account not found");
        return;
      }

      if (
        userData.moderationStatus === ModerationStatusEnum.BLOCKED ||
        userData.moderationStatus === ModerationStatusEnum.SUSPENDED
      ) {
        signOut(res, 402, `Account ${userData.moderationStatus}`);
        return;
      }

      res.status(200).json({ message: userData });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
