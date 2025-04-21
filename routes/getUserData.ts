import { Router, Response, NextFunction } from "express";
import { CustomRequest, ModerationStatusEnum } from "types.js";
import signOut from "@/functions/signOut.js";
import { defaultUserProjection } from "@/functions/checkIfUserExists.js";
import getUserInfo from "@/functions/getUserInfo.js";

const route = Router();

route.get("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    const userInfo = await getUserInfo({ userId: req.userId, projection: defaultUserProjection });

    if (
      userInfo?.moderationStatus === ModerationStatusEnum.BLOCKED ||
      userInfo?.moderationStatus === ModerationStatusEnum.SUSPENDED
    ) {
      signOut(res, 402, `Account ${userInfo?.moderationStatus}`);
      return;
    }

    res.status(200).json({ message: userInfo });
  } catch (err) {
    next(err);
  }
});

export default route;
