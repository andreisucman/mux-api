import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import { defaultUser } from "data/defaultUser.js";
import { ModerationStatusEnum, UserType } from "types.js";
import updateAnalytics from "./updateAnalytics.js";
import { getTimezoneOffset } from "@/helpers/utils.js";
import httpError from "@/helpers/httpError.js";
import createRandomAvatar from "@/helpers/createAvatar.js";
import createRandomName from "./createRandomName.js";

async function createUser(props: Partial<UserType>) {
  let { _id: userId, ...otherProps } = props || {};

  try {
    const timeZoneOffsetInMinutes = getTimezoneOffset(otherProps.timeZone);

    const updatePayload = {
      ...defaultUser,
      ...otherProps,
      timeZoneOffsetInMinutes: Math.round(timeZoneOffsetInMinutes),
    };

    if (!userId) {
      userId = new ObjectId();
    } else {
      const avatar = createRandomAvatar(otherProps.demographics?.ethnicity);
      const name = await createRandomName();
      updatePayload.avatar = avatar;
      updatePayload.name = name;
    }

    await doWithRetries(
      async () =>
        await db.collection("User").updateOne(
          {
            _id: new ObjectId(userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          { $set: updatePayload },
          { upsert: true }
        )
    );

    updateAnalytics({
      userId: String(userId),
      incrementPayload: { "overview.user.count.totalUsers": 1 },
    });

    return { ...updatePayload, _id: userId };
  } catch (err) {
    throw httpError(err);
  }
}

export default createUser;
