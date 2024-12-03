import * as emoji from "node-emoji";
import * as newEmoji from "node-emoji-new";

export default function findEmoji(key: string) {
  if (!key) return;

  let current = emoji.find(key)?.emoji;
  if (!current) current = newEmoji.find(key)?.emoji;
  if (!current) current = emoji.search(key)[0]?.emoji;
  if (!current) current = newEmoji.search(key)[0]?.emoji;
  return current;
}
