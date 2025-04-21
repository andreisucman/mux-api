import { CustomRequest } from "types.js";
import { Router, Response, NextFunction } from "express";
import getLatestTasks from "@/functions/getLatestTasks.js";

const route = Router();

route.get("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    const tasks = await getLatestTasks({ userId: req.userId, timeZone: req.timeZone });
    res.status(200).json({ message: tasks });
  } catch (err) {
    next(err);
  }
});

export default route;
