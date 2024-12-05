import { Request, Response, NextFunction } from "express";
import csrf from "csrf";

const csrfProtection = new csrf();

export default function addCsrfProtection(
  req: Request,
  res: Response,
  next: NextFunction
) {
  let token = req.cookies.MUX_csrfToken;

  if (!token) {
    const secret = req.cookies.MUX_csrfSecret || csrfProtection.secretSync();

    token = csrfProtection.create(secret);

    res.cookie("MUX_csrfToken", token, {
      // domain: ".muxout.com",
      sameSite: "none",
      secure: true,
    });
    res.cookie("MUX_csrfSecret", secret, {
      httpOnly: true,
      // domain: ".muxout.com",
      secure: true,
      sameSite: "none",
    });
  }

  next();
}
