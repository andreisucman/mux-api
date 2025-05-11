import { Router } from "express";
import { redis } from "@/init.js";
import { setupSSE } from "@/helpers/utils.js";
import { CustomRequest } from "@/types.js";
import { Redis } from "ioredis";

const route = Router();

route.get("/:streamId", async (req: CustomRequest, res, next) => {
  const { streamId } = req.params;
  const channel = `sse:${streamId}`;
  const subscriber = new Redis({
    ...redis.options,
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
  subscriber.on("error", (err) => console.error("Subscriber error:", err));

  try {
    await subscriber.connect();
    const sessionData = await redis.get(streamId);

    setupSSE(res);

    if (!sessionData) {
      res.write("Please start the analysis anew");
      res.end();
      return;
    }

    const session = JSON.parse(sessionData);

    if (session.text) {
      res.write(session.text);
    }

    if (session.finished) {
      res.write(`event: end\n`);
      res.end();
      return;
    }

    const messageHandler = (message: string) => {
      try {
        const { type, content } = JSON.parse(message);
        switch (type) {
          case "chunk":
            res.write(content);
            break;
          case "close":
            res.write(`event: end\n`);
            res.end();
            break;
          case "error":
            res.write("Stream error");
            res.end();
            break;
        }
      } catch (err) {
        console.error("Error handling message:", err);
        res.write("Invalid message format");
        res.end();
      }
    };

    await subscriber.subscribe(channel);
    subscriber.on("message", (_, message) => {
      messageHandler(message);
    });

    req.on("close", async () => {
      if (subscriber?.status === "ready") {
        await subscriber.unsubscribe(channel);
        await subscriber.quit();
      }
    });
  } catch (error) {
    if (subscriber?.status === "ready") {
      await subscriber.unsubscribe(channel);
      await subscriber.quit();
    }
    if (res.headersSent) {
      res.write("Internal server error");
      res.end();
    } else {
      next(error);
    }
  }
});

export default route;
