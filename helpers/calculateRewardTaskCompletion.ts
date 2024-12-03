import { StreaksType } from "types.js";

function calculatePercentage(dividend: number, divider: number) {
  if (divider === 0) return 0;
  return Number(((dividend / divider) * 100).toFixed(2));
}

type Props = {
  userConditions: { [key: string]: number };
  requisite: { [key: string]: number };
};

export default function calculateRewardTaskCompletion({
  userConditions,
  requisite,
}: Props) {
  if (!userConditions || !requisite) return { icon: "", value: 0 };

  const keys = Object.keys(requisite).filter((key) => key in userConditions);
  if (keys.length === 0) return { icon: "", value: 0 };

  let highestKey = keys[0];
  let highestValue = userConditions[highestKey as keyof StreaksType] || 0;

  for (const key of keys) {
    if ((userConditions[key as keyof StreaksType] || 0) > highestValue) {
      highestKey = key;
      highestValue = userConditions[key as keyof StreaksType];
    }
  }

  const percentage = calculatePercentage(highestValue, requisite[highestKey]);
  return percentage;
}
