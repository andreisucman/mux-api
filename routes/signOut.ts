import * as dotenv from "dotenv";
dotenv.config();
import { redis } from "@/init.js";
import { Router, Request, Response, NextFunction } from "express";
import signOut from "@/functions/signOut.js";

const route = Router();

route.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const accessToken = req.cookies["MUX_accessToken"];
    await redis.del(accessToken);
    signOut(res, 200, "Logged out");
  } catch (err) {
    next(err);
  }
});

export default route;
