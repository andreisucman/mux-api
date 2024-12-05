import { Response } from "express";

export default function signOut(res: Response, status: number, error: string) {
  res.cookie("MUX_accessToken", "", { expires: new Date(0) });
  res.cookie("MUX_csrfToken", "", { expires: new Date(0) });
  res.cookie("MUX_csrfSecret", "", { expires: new Date(0) });
  res.cookie("MUX_isLoggedIn", "", { expires: new Date(0) });
  res.status(status).json({ error });
}
