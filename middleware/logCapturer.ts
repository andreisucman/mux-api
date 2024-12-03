import { pino } from "pino";
import { pinoHttp } from "pino-http";

const logger = pino({
  level: "error",
});

const logCapturer = pinoHttp({ logger });

export default logCapturer;
