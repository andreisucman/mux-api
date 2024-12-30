import lib from "emojilib";
import { matchSorter } from "match-sorter";

function searchEmojilib(key: string) {
  const library = Object.entries(lib).map(([name, emojiObject]) => {
    return {
      keywords: [name, ...emojiObject as unknown as any[]],
      name,
    };
  });

  function searchEmoji(key: string) {
    return matchSorter(library, key, { keys: ["keywords"] });
  }

  return searchEmoji(key);
}

export default searchEmojilib;
