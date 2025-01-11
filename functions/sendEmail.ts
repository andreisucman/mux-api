import { sesClient } from "init.js";
import { SendEmailCommand } from "@aws-sdk/client-ses";
import httpError from "@/helpers/httpError.js";

type Props = {
  to: string;
  from?: string;
  subject: string;
  html: string;
};

const sendEmail = async ({
  to,
  from = process.env.SES_FROM_ADDRESS,
  subject,
  html,
}: Props) => {
  const payload = {
    Destination: { ToAddresses: [to] },
    Message: {
      Body: {
        Html: { Data: html },
      },
      Subject: { Data: subject },
    },
    Source: from,
  };

  try {
    const sendEmailCommand = new SendEmailCommand(payload);
    await sesClient.send(sendEmailCommand);
  } catch (err) {
    throw httpError(err);
  }
};

export default sendEmail;
