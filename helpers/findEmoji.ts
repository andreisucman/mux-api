import * as emoji from "node-emoji";
import emojiDictionary from "emoji-dictionary";
import emojione from "emojione";

export default async function findEmoji(key: string) {
  if (!key) return null;

  let current = null;

  current = emoji.find(key)?.emoji;

  if (!current) {
    current = emojiDictionary.getUnicode(key);
  }

  if (!current) {
    current = emojione.shortnameToUnicode(":" + key + ":");
  }

  if (current.startsWith(":")) current = null;
  return current || null;
}
