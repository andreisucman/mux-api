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
        err && err.stack ? err.stack.split("\n").slice(2, 3).join("\n") : null;

      return {
        time,
        statusCode,
        ip,
        msg,
        errorStack,
        server: "api",
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
