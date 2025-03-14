import httpError from "@/helpers/httpError.js";
import addSuspiciousRecord, {
  SuspiciousRecordCollectionEnum,
} from "./addSuspiciousRecord.js";
import moderateContent from "./moderateContent.js";

type CheckTextSafetyProps = {
  userId: string;
  text: string;
  key?: string;
  collection: SuspiciousRecordCollectionEnum;
};

export default async function checkTextSafety({
  userId,
  text,
  collection,
  key,
}: CheckTextSafetyProps) {
  try {
    const { isSafe, isSuspicious, moderationResults } = await moderateContent({
      content: [{ type: "text", text }],
    });

    if (!isSafe) return false;

    if (moderationResults.length > 0) {
      if (isSuspicious) {
        addSuspiciousRecord({
          collection,
          moderationResults,
          contentId: userId,
          userId,
          key,
        });
      }
    }

    return true;
  } catch (err) {
    throw httpError(err);
  }
}
