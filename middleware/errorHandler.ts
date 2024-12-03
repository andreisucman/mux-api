import { HttpError } from "@/helpers/httpError.js";
import { Request, Response } from "express";

export default function errorHandler(
  err: HttpError,
  req: Request,
  res: Response
): void {
  req.log.error({
    err,
    server: "api",
    stack: err.stack,
    query: req.query,
    params: req.params,
    body: req.body,
  });

  res.status(err.status || 500).json({
    message: err.forward ? err.message : "Server error",
    status: err.status || 500,
  });
}
