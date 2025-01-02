import httpError from "@/helpers/httpError.js";
import updateAnalytics from "./updateAnalytics.js";

type ConcernInputType = { name: string; isDisabled: boolean; part: string };

export default async function updateConcernsAnalytics(
  concerns: ConcernInputType[]
) {
  try {
    const partsConcerns = concerns.reduce(
      (a: { [key: string]: number }, c: ConcernInputType) => {
        const key = `overview.usage.concerns.part.${c.part}`;

        a[key] = 1;

        return a;
      },
      {}
    );

    const keyConcerns = concerns.reduce(
      (a: { [key: string]: number }, c: ConcernInputType) => {
        const key = `overview.usage.concerns.key.${c.name}`;

        a[key] = 1;

        return a;
      },
      {}
    );

    const statusConcern = concerns.reduce(
      (a: { [key: string]: number }, c: ConcernInputType) => {
        const key = `overview.usage.concerns.[${
          c.isDisabled ? "disabled" : "active"
        }].${c.name}`;

        a[key] = 1;

        return a;
      },
      {}
    );

    updateAnalytics({
      ...partsConcerns,
      ...keyConcerns,
      ...statusConcern,
    });
  } catch (err) {
    throw httpError(err);
  }
}
