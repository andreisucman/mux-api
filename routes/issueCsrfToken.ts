import { Router, NextFunction } from "express";

const route = Router();

route.get("/", async (req, res, next: NextFunction) => {
  try {
    const token = req.cookies.MUX_csrfToken;
    res.json({ message: token });
  } catch (err) {
    next(err);
  }
});

export default route;
