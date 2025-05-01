import { Request, Response, NextFunction } from "express";
import * as promClient from "prom-client";
import { promClientRegister } from "@/init.js";

function getBasePath(url: string) {
  const pathWithoutQuery = url.split("?")[0];
  const segments = pathWithoutQuery.split("/").filter(Boolean);
  return segments.length > 0 ? `/${segments[0]}` : "/";
}

const serverLabel = "api";

const httpRequestDuration = new promClient.Histogram({
  name: "http_request_duration_ms",
  help: "Duration of HTTP requests in milliseconds",
  labelNames: ["server", "method", "route", "status_code"],
  buckets: [50, 100, 200, 500, 1000, 2000, 5000],
});

const httpStatusCounter = new promClient.Counter({
  name: "http_responses_total",
  help: "Total HTTP responses by status code",
  labelNames: ["server", "method", "route", "status_code"],
});

const httpRequestSizeBytes = new promClient.Histogram({
  name: "http_request_size_bytes",
  help: "Size of HTTP request bodies in bytes",
  labelNames: ["server", "method", "route"],
  buckets: [100, 1000, 5000, 10000, 50000, 100000],
});

const httpResponseSizeBytes = new promClient.Histogram({
  name: "http_response_size_bytes",
  help: "Size of HTTP response bodies in bytes",
  labelNames: ["server", "method", "route", "status_code"],
  buckets: [100, 1000, 5000, 10000, 50000, 100000],
});

const httpErrorCounter = new promClient.Counter({
  name: "http_errors_total",
  help: "Total HTTP errors (4xx and 5xx)",
  labelNames: ["server", "method", "route", "status_code"],
});

[httpRequestDuration, httpStatusCounter, httpRequestSizeBytes, httpResponseSizeBytes, httpErrorCounter].forEach(
  (metric) => promClientRegister.registerMetric(metric)
);

promClient.collectDefaultMetrics({
  register: promClientRegister,
  labels: { server: serverLabel },
});

export default function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const { method, url } = req;
  const route = getBasePath(url);

  if (method !== "GET" && req.headers["content-length"]) {
    const contentLength = parseInt(req.headers["content-length"], 10) || 0;
    httpRequestSizeBytes.labels(serverLabel, method, route).observe(contentLength);
  }

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const isError = statusCode >= 400;

    httpRequestDuration.labels(serverLabel, method, route, String(statusCode)).observe(duration);
    httpStatusCounter.labels(serverLabel, method, route, String(statusCode)).inc();

    if (isError) {
      httpErrorCounter.labels(serverLabel, method, route, String(statusCode)).inc();
    }

    const contentLength = parseInt(res.getHeader("content-length")?.toString() || "0", 10) || 0;
    httpResponseSizeBytes.labels(serverLabel, method, route, String(statusCode)).observe(contentLength);
  });

  next();
}
