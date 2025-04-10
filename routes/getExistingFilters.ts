import * as dotenv from "dotenv";
dotenv.config();
import { Router, Response, NextFunction } from "express";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";

type ExistingFiltersType = {
  bodyType: string[];
  ethnicity: string[];
  concern: string[];
  nearestConcerns: string[];
  ageInterval: string[];
  sex: string[];
  part: string[];
  taskName: string[];
};

const emptyFilters: ExistingFiltersType = {
  bodyType: [],
  ethnicity: [],
  concern: [],
  nearestConcerns: [],
  ageInterval: [],
  sex: [],
  part: [],
  taskName: [],
};

const route = Router();

const collectionMap: { [key: string]: string } = {
  progress: "BeforeAfter",
  proof: "Proof",
};

route.get(
  "/:collection",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { collection } = req.params;

    try {
      const object = await doWithRetries(async () =>
        db
          .collection("ExistingFilters")
          .findOne({ collection: collectionMap[collection] })
      );

      let result = emptyFilters;

      if (object) result = object.filters;

      res.status(200).json({ message: result });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
