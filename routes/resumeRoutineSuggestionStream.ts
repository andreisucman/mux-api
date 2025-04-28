import { Router } from "express";
import { redis } from "@/init.js";
import { setupSSE } from "@/helpers/utils.js";
import { CustomRequest } from "@/types.js";

const route = Router();

route.get("/:streamId", async (req: CustomRequest, res) => {
  const { streamId } = req.params;
  const channel = `sse:${streamId}`;
  const clientSubscriber = redis.duplicate();

  try {
    await clientSubscriber.connect();
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
      res.end();
      return;
    }

    const messageHandler = (message: string) => {
      const { type, content } = JSON.parse(message);
      switch (type) {
        case "chunk":
          res.write(content);
          break;
        case "close":
          res.end();
          break;
        case "error":
          res.write("Stream error");
          res.end();
          break;
      }
    };

    await clientSubscriber.subscribe(channel, messageHandler);

    req.on("close", () => {
      if (clientSubscriber.isOpen) {
        clientSubscriber.unsubscribe(channel);
        clientSubscriber.quit();
        if (clientSubscriber?.isOpen) clientSubscriber.quit();
      }
    });
  } catch (error) {
    if (clientSubscriber?.isOpen) clientSubscriber.quit();
    res.status(500).json({ error: "Internal server error" });
  }
});

export default route;
