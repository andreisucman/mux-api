import * as dotenv from "dotenv";
dotenv.config();
import { Router, Response } from "express";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";

type ExistingFiltersType = {
  bodyType: string[];
  ethnicity: string[];
  skinColor: string[];
  concern: string[];
  nearestConcerns: string[];
  ageInterval: string[];
  sex: string[];
  type: string[];
  styleName: string[];
  taskName: string[];
};

const emptyFilters: ExistingFiltersType = {
  bodyType: [],
  ethnicity: [],
  skinColor: [],
  concern: [],
  nearestConcerns: [],
  ageInterval: [],
  sex: [],
  type: [],
  styleName: [],
  taskName: [],
};

const route = Router();

route.get("/:collection", async (req: CustomRequest, res: Response) => {
  const { collection } = req.params;

  try {
    const object = await doWithRetries({
      functionName: "getExistingFilters",
      functionToExecute: async () =>
        db.collection("ExistingFilters").findOne({ collection }),
    });

    let result = emptyFilters;

    if (object) result = object.filters;

    res.status(200).json({ message: result });
  } catch (error) {
    addErrorLog({ functionName: "getExistingFilters", message: error.message });
  }
});

export default route;
