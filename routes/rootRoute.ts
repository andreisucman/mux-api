import httpError from "@/helpers/httpError.js";
import { Router, NextFunction } from "express";

const route = Router();

route.get("/", (_, res, next: NextFunction) => {
  try {
    res.status(200).end();
  } catch (err) {
    next(httpError(err.message, err.status));
  }
});

export default route;
