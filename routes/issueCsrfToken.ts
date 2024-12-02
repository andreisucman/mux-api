import { Router } from "express";
import addErrorLog from "functions/addErrorLog.js";

const route = Router();

route.get("/", async (req, res) => {
  try {
    const token = req.cookies.MYO_csrfToken;
    res.json({ message: token });
  } catch (error) {
    addErrorLog({ functionName: "issueCsrfToken", message: error.message });
    res.status(500).json({ error: "Server error" });
  }
});

export default route;
