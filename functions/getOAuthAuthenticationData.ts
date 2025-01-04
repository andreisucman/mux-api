import getGoogleToken from "./getGoogleToken.js";
import getOauthRedirectUri from "@/helpers/getOauthRedirectUri.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  code: string;
  redirectPath: string;
};

async function getOAuthAuthenticationData(props: Props) {
  const { code, redirectPath } = props;
  try {
    const redirectUrl = getOauthRedirectUri(redirectPath);

    const authData = await getGoogleToken(code, redirectUrl);

    if (!authData) {
      throw httpError("Failed to get Google token");
    }

    const { email, accessToken } = authData;

    return { email, accessToken };
  } catch (err) {
    throw httpError(err);
  }
}

export default getOAuthAuthenticationData;
