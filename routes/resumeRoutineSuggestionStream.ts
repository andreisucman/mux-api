import { Router } from "express";
import { redis } from "@/init.js";
import { setupSSE } from "@/helpers/utils.js";
import { CustomRequest } from "@/types.js";

const route = Router();

route.get("/:streamId", async (req: CustomRequest, res) => {
  const { streamId } = req.params;
  const channel = `sse:${streamId}`;
  const clientSubscriber = redis.duplicate();

  console.log("resume stream streamId", streamId);

  try {
    await clientSubscriber.connect();
    const sessionData = await redis.get(streamId);

    if (!sessionData) {
      res.write("event: error\n\ndata: Please start the analysis anew.\n\n");
      res.end();
      return;
    }

    setupSSE(res);
    const session = JSON.parse(sessionData);

    console.log("resume stream session text", session.text);

    if (session.text) {
      res.write(`data: ${session.text}\n\n`);
    }

    if (session.finished) {
      res.write("event: close\n\n");
      res.end();
      return;
    }

    const messageHandler = (message: string) => {
      const { type, content } = JSON.parse(message);
      switch (type) {
        case "chunk":
          res.write(`data: ${content}\n\n`);
          break;
        case "close":
          res.write("event: close\n\n");
          res.end();
          break;
        case "error":
          res.write("event: error\n\ndata: Stream error\n\n");
          res.end();
          break;
      }
    };

    await clientSubscriber.subscribe(channel, messageHandler);

    req.on("close", () => {
      if (clientSubscriber.isOpen) {
        clientSubscriber.unsubscribe(channel);
        clientSubscriber.quit();
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  } finally {
    if (clientSubscriber.isOpen) clientSubscriber.quit();
  }
});

export default route;
