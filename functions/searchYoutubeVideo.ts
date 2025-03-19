import * as dotenv from "dotenv";
dotenv.config();

export default async function searchYoutubeVideo(keywords: string) {
  const baseUrl = "https://www.googleapis.com/youtube/v3/search";
  const params = {
    part: "snippet",
    q: encodeURIComponent(keywords),
    maxResults: 1,
    type: "video",
    videoEmbeddable: "true",
    relevanceLanguage: "en",
    key: process.env.YOUTUBE_DATA_API_KEY,
  };

  const queryString = Object.keys(params)
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  try {
    const response = await fetch(`${baseUrl}?${queryString}`);
    const data = await response.json();

    console.log("data", data);

    if (!data.items || data.items.length === 0) {
      return null;
    }

    const firstItem = data.items[0];

    return `https://www.youtube.com/embed/${firstItem.id.videoId}`;
  } catch (error) {
    console.error("Error fetching YouTube videos:", error);
    return null;
  }
}
