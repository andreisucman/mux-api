import * as dotenv from "dotenv";
dotenv.config();

export default async function searchYoutubeVideos(keywords: string) {
  const baseUrl = "https://www.googleapis.com/youtube/v3/search";
  const params = {
    part: "snippet",
    q: encodeURIComponent(keywords),
    maxResults: 3,
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

    if (!data.items || data.items.length === 0) {
      return null;
    }

    const items = data.items.slice(0, 3);

    return items.map(
      (item) => `https://www.youtube.com/embed/${item.id.videoId}`
    );
  } catch (error) {
    console.error("Error fetching YouTube videos:", error);
    return null;
  }
}
