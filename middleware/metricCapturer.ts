import { Request, Response, NextFunction } from "express";
import * as promClient from "prom-client";
import { promClientRegister } from "@/init.js";

const httpRequestDurationMilliseconds = new promClient.Histogram({
  name: "http_request_duration_ms",
  help: "Histogram of HTTP request duration in milliseconds",
  buckets: [50, 100, 200, 500, 1000, 2000, 5000, 10000, 50000, 200000], // response time buckets in ms
  labelNames: ["route", "status_code"],
});

promClientRegister.registerMetric(httpRequestDurationMilliseconds);

const httpResponseCodeCounter = new promClient.Counter({
  name: "http_response_codes_total",
  help: "Total count of HTTP response codes by status code",
  labelNames: ["status_code", "route"],
});

promClientRegister.registerMetric(httpResponseCodeCounter);

promClient.collectDefaultMetrics({ register: promClientRegister });

export default async function trackMetrics(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const start = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - start;
      const statusCode = res.statusCode;
      const route = req.route ? req.route.path : req.url;

      httpRequestDurationMilliseconds.observe(
        { route, status_code: statusCode },
        duration
      );

      httpResponseCodeCounter.inc({ status_code: statusCode });
    });

    next();
  } catch (err) {
    next(err);
  }
}
