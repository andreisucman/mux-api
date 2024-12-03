import { Router } from "express";

const route = Router();

route.get("/", (_, res) => {
  res.status(200).end();
});

export default route;
