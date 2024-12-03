import { Request, Response, NextFunction } from "express";

const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  req.log.error({
    err,
    stack: err.stack,
    query: req.query,
    params: req.params,
    body: req.body,
  });

  res.status(err.status || 500).json({
    message: err.message || "Server error",
    status: err.status || 500,
  });
};

export default errorHandler;
