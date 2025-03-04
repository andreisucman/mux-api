import * as dotenv from "dotenv";
dotenv.config();
import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import uploadFilesToS3 from "functions/uploadFilesToS3.js";

const upload = multer({ storage: multer.memoryStorage() });
const route = Router();

route.post(
  "/",
  upload.array("files", 20),
  async (req: Request, res: Response, next: NextFunction) => {

    if (!req.files || req.files.length === 0) {
      res.status(400).json({ error: "No files uploaded." });
      return;
    }

    try {
      const uploadedUrls = await uploadFilesToS3(req.files);
      res.status(200).json({ message: uploadedUrls });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
