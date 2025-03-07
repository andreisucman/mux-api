import * as emoji from "node-emoji";
import emojiDictionary from "emoji-dictionary";
import emojione from "emojione";

const defaultEmoji = "🚩";

export default async function findEmoji(keys: string[]) {
  if (!keys.length) return defaultEmoji;

  for (const key of keys) {
    const one = emoji.find(key)?.emoji;
    if (one) return one;

    const two = emojiDictionary.getUnicode(key);
    if (two) return two;

    const three = emojione.shortnameToUnicode(":" + key + ":");
    if (three && !three.startsWith(":")) return three;

    return defaultEmoji;
  }
}
