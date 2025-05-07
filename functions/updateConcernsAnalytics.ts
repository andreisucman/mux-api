import httpError from "@/helpers/httpError.js";
import updateAnalytics from "./updateAnalytics.js";

type ConcernInputType = { name: string; part: string };

type Props = {
  userId: string;
  concerns: ConcernInputType[];
};

export default async function updateConcernsAnalytics({ concerns, userId }: Props) {
  try {
    const partsConcerns = concerns.reduce((a: { [key: string]: number }, c: ConcernInputType) => {
      const key = `overview.user.usage.concerns.part.${c.part}`;
      a[key] = 1;
      return a;
    }, {});

    const keyConcerns = concerns.reduce((a: { [key: string]: number }, c: ConcernInputType) => {
      const key = `overview.user.usage.concerns.name.${c.name}`;
      a[key] = 1;
      return a;
    }, {});

    updateAnalytics({
      userId: String(userId),
      incrementPayload: {
        ...partsConcerns,
        ...keyConcerns,
      },
    });
  } catch (err) {
    throw httpError(err);
  }
}
