import { NextActionType, PartEnum } from "types.js";
import formatDate from "./formatDate.js";

type Props = {
  nextAction: NextActionType[];
  part: PartEnum;
};

function parseActionDate(scanRecord?: { date: Date | null }) {
  return scanRecord?.date ? new Date(scanRecord.date) : null;
}

export default async function checkCanAction({ nextAction, part }: Props) {
  let result: {
    isActionAvailable: boolean;
    checkBackDate: string | null;
  } = {
    isActionAvailable: false,
    checkBackDate: formatDate({ date: new Date() }),
  };

  if (!nextAction || !part) return result;

  const availableParts = nextAction.find((p) => p.part === part);

  const partDate = parseActionDate(availableParts);

  if (partDate) {
    result.checkBackDate = partDate.toDateString();
    result.isActionAvailable = partDate < new Date();
  } else {
    result.isActionAvailable = true;
  }

  return result;
}
