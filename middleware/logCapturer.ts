import { pino } from "pino";
import { pinoHttp } from "pino-http";

const logger = pino({
  level: "error",
  formatters: {
    level(label, number) {
      return { level: label };
    },
    log(obj) {
      const { statusCode, ip, msg, time, err, req } = obj as any;

      const errorStack =
        err && err.stack ? err.stack.split("\n").slice(0, 2).join("\n") : null;

      const headers = req?.headers ? { host: req.host } : {};

      return {
        time,
        statusCode,
        ip,
        msg,
        errorStack,
        headers,
        user: req?.userId || null,
        env: process.env.NODE_ENV || "production",
        version: process.version,
      };
    },
  },
});

const logCapturer = pinoHttp({
  logger,
  customAttributeKeys: { reqId: "reqId" },
});

export default logCapturer;
