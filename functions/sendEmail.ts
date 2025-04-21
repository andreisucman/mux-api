import { sesClient } from "init.js";
import { SendEmailCommand, SendEmailCommandInput } from "@aws-sdk/client-ses";
import httpError from "@/helpers/httpError.js";

type Props = {
  to: string;
  from?: string;
  replyTo?: string;
  subject: string;
  html: string;
};

const sendEmail = async ({ to, from = process.env.SES_FROM_ADDRESS, replyTo, subject, html }: Props) => {
  const payload: SendEmailCommandInput = {
    Destination: { ToAddresses: [to] },
    ReplyToAddresses: [replyTo],
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
