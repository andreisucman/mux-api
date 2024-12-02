type FormatDateProps = {
  date: Date | string;
  hideYear?: boolean;
  hideMonth?: boolean;
  addTime?: boolean;
};

export default function formatDate({
  date,
  hideYear,
  hideMonth,
  addTime,
}: FormatDateProps) {
  const dateObj = new Date(date);
  const day = dateObj.getDate();
  const monthIndex = dateObj.getMonth();
  const year = dateObj.getFullYear().toString().slice(2);
  const hour = dateObj.getHours().toString().padStart(2, "0");
  const minute = dateObj.getMinutes().toString().padStart(2, "0");

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  let dateString = `${day} `;
  if (!hideMonth) {
    dateString += `${months[monthIndex]} `;
  }
  if (!hideYear && !hideMonth) {
    dateString += `${year} `;
  }
  if (addTime) {
    dateString += `- ${hour}:${minute}`;
  }
  return dateString.trim();
}
