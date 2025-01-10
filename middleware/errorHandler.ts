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

  if (res.headersSent) return;

  const message = err.status === 200 ? err.message : "Server error";

  res.status(err.status || 500).json({
    error: message,
    status: err.status || 500,
  });
};

export default errorHandler;
