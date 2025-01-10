import { Router, NextFunction } from "express";
import { promClientRegister } from "@/init.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.get("/", async (_, res, next: NextFunction) => {
  try {
    res.set("Content-Type", promClientRegister.contentType);
    res.end(await promClientRegister.metrics());
  } catch (err) {
    next(httpError(err.message, err.status));
  }
});

export default route;
