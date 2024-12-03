import { Response } from "express";

export default function signOut(res: Response, status: number, error: string) {
  res.cookie("MYO_accessToken", "", { expires: new Date(0) });
  res.cookie("MYO_csrfToken", "", { expires: new Date(0) });
  res.cookie("MYO_csrfSecret", "", { expires: new Date(0) });
  res.cookie("MYO_isLoggedIn", "", { expires: new Date(0) });
  res.status(status).json({ error });
}
