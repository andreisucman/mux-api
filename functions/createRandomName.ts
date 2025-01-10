import { names } from "fancy-random-names";
import {
  uniqueNamesGenerator,
  adjectives,
  NumberDictionary,
} from "unique-names-generator";
import isNameUnique from "./isNameUnique.js";
import httpError from "@/helpers/httpError.js";

const numberDictionary = NumberDictionary.generate({ min: 100, max: 999 });

export default async function createRandomName() {
  try {
    let name = "";
    let isUnique = false;

    while (!isUnique) {
      name = uniqueNamesGenerator({
        dictionaries: [adjectives, names, numberDictionary],
        length: 2,
        style: "lowerCase",
        separator: "_",
      });
      isUnique = await isNameUnique(name);
    }

    return name;
  } catch (err) {
    throw httpError(err.message, err.status);
  }
}
