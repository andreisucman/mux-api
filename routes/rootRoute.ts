import { Router, NextFunction } from "express";

const route = Router();

route.get("/", (_, res, next: NextFunction) => {
  try {
    res.status(200).end();
  } catch (err) {
    next(err);
  }
});

export default route;
