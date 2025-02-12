import * as dotenv from "dotenv";
dotenv.config();

import { Response } from "express";

export default function signOut(res: Response, status: number, error: string) {
  const domain = process.env.ENV === "dev" ? undefined : ".muxout.com";

  res.cookie("MUX_accessToken", "", {
    expires: new Date(0),
    httpOnly: true,
    secure: true,
    sameSite: "none",
    domain,
    path: "/",
  });

  res.cookie("MUX_csrfToken", "", {
    expires: new Date(0),
    httpOnly: false,
    secure: true,
    sameSite: "none",
    domain,
    path: "/",
  });

  res.cookie("MUX_csrfSecret", "", {
    expires: new Date(0),
    httpOnly: false,
    secure: true,
    sameSite: "none",
    domain,
    path: "/",
  });

  res.cookie("MUX_isLoggedIn", "", {
    expires: new Date(0),
    httpOnly: false,
    secure: true,
    sameSite: "none",
    domain,
    path: "/",
  });

  res.status(status).json({ error });
}
