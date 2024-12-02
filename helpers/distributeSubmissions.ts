import { ObjectId } from "mongodb";

export default function distributeSubmissions(
  totalSubmissions: number,
  daysPeriod = 7,
  name: string
) {
  const result = Array.from({ length: daysPeriod }, () => []);
  let submissionsLeft = totalSubmissions;

  for (let i = 0; i < daysPeriod; i++) {
    const submissionsForDay = Math.floor(submissionsLeft / (daysPeriod - i));

    for (let j = 0; j < submissionsForDay; j++) {
      result[i].push({
        submissionId: String(new ObjectId()),
        name: name.toLowerCase(),
        proofId: "",
        isSubmitted: false,
      });
    }

    submissionsLeft -= submissionsForDay;
  }

  for (let i = 0; i < submissionsLeft; i++) {
    result[i].push({
      submissionId: String(new ObjectId()),
      name: name.toLowerCase(),
      proofId: "",
      isSubmitted: false,
    });
  }

  return result.filter((arr) => arr.length > 0);
}
