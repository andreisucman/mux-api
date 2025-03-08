import * as emoji from "node-emoji";
import emojiDictionary from "emoji-dictionary";
import emojione from "emojione";

const defaultEmoji = "🚩";

export default async function findEmoji(keys: string[]) {
  if (!keys.length) return defaultEmoji;

  let result;

  for (const key of keys) {
    const one = emoji.find(key)?.emoji;

    if (one) {
      result = one;
      break;
    }

    const two = emojiDictionary.getUnicode(key);

    if (two) {
      result = two;
      break;
    }

    const three = emojione.shortnameToUnicode(":" + key + ":");

    if (three && !three.startsWith(":")) {
      result = three;
      break;
    }
  }

  return result || defaultEmoji;
}
