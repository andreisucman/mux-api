import { createAvatar } from "@dicebear/core";
import { micah } from "@dicebear/collection";
import generateAvatarParams from "@/helpers/avatar.js";

export default function createRandomAvatar(ethnicity?: string) {
  const avatarParams = generateAvatarParams(ethnicity);
  const avatarConfig = createAvatar(micah, avatarParams as any);
  const imageAvatar = avatarConfig.toDataUri();
  const avatar = { config: avatarParams, image: imageAvatar };
  return avatar;
}
