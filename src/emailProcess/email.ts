import { google } from "googleapis";
import { GmailMessage } from "../types";
import { CHECK_POST_CURRENT_TIME, MAX_MAIL } from "..";
import { getLastProcessedTime, updateLastProcessedTime } from "../utils";
import { shouldIgnoreEmail } from "../spamEmail/pattern";
import { analyzeEmail } from "../ai/analyzeEmail";

// Gmail label management
async function getOrCreateLabel(auth: any, labelName: string): Promise<string> {
  const gmail = google.gmail({ version: "v1", auth });

  try {
    const res = await gmail.users.labels.list({ userId: "me" });
    const existingLabel = res.data.labels?.find((label) => label.name === labelName);

    if (existingLabel) {
      return existingLabel.id!!;
    }

    const newLabel = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name: labelName,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    });

    return newLabel.data.id ?? "";
  } catch (error) {
    console.error("Error managing label:", error);
    throw error;
  }
}

// Email reply function
async function sendReply(
  auth: any,
  originalMessage: GmailMessage,
  replyText: string
): Promise<void> {
  const gmail = google.gmail({ version: "v1", auth });

  const headers = originalMessage.payload.headers;
  const subject = headers.find((header) => header.name === "Subject")?.value || "";
  const from = headers.find((header) => header.name === "From")?.value || "";
  const messageId = headers.find((header) => header.name === "Message-ID")?.value || "";

  const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
  const emailContent = `From: me
To: ${from}
Subject: ${replySubject}
In-Reply-To: ${messageId}
References: ${messageId}
Content-Type: text/plain; charset="UTF-8"

${replyText}`;

  const encodedEmail = Buffer.from(emailContent)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedEmail,
      threadId: originalMessage.threadId,
    },
  });
}

// Main email processing function
async function processNewEmails(auth: any): Promise<void> {
  const gmail = google.gmail({ version: "v1", auth });

  try {
    let query = "is:unread";

    if (CHECK_POST_CURRENT_TIME) {
      const lastProcessedTime = await getLastProcessedTime();
      const afterDate = new Date(lastProcessedTime).toISOString();
      query += ` after:${afterDate}`;
    }

    const res = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: MAX_MAIL,
    });

    if (!res.data.messages) {
      console.log("No new messages found.");
      if (CHECK_POST_CURRENT_TIME) {
        await updateLastProcessedTime(Date.now());
      }
      return;
    }

    console.log(`Found ${res.data.messages.length} unread messages`);

    // going through [MAX_MAIL] no. of mail
    for (const message of res.data.messages) {
      // @ts-ignore
      const email = await gmail.users.messages.get({
        userId: "me",
        id: message.id,
        format: "full",
      });

      // @ts-ignore
      const headers: GmailMessageHeader[] = email?.data?.payload.headers || [];
      const from = headers.find((header) => header.name === "From")?.value || "";
      const to = headers.find((header) => header.name === "To")?.value || "";
      const subject = headers.find((header) => header.name === "Subject")?.value || "(no subject)";

      console.log(`\nProcessing email from: ${from}`);
      console.log(`Subject: ${subject}`);

      if (await shouldIgnoreEmail(from)) {
        console.log(`→ Ignoring automated email`);
        // @ts-ignore
        await gmail.users.messages.modify({
          userId: "me",
          id: message.id,
          requestBody: {
            removeLabelIds: ["UNREAD", "INBOX"],
          },
        });
        continue;
      }

      //  @ts-ignore
      const emailPayload = email?.data?.payload;
      let emailContent = "";

      if (emailPayload.parts) {
        for (const part of emailPayload.parts) {
          if (part.mimeType === "text/plain" && part.body?.data) {
            emailContent += Buffer.from(part.body.data, "base64").toString();
          }
        }
      } else if (emailPayload.body?.data) {
        emailContent = Buffer.from(emailPayload.body.data, "base64").toString();
      }

      if (!emailContent.trim()) {
        console.log("→ No readable content found in email");
        continue;
      }

      try {
        console.log("→ Analyzing content with AI...");
        const analysis = await analyzeEmail(emailContent, from, to);
        const labelId = await getOrCreateLabel(auth, analysis.label);

        // @ts-ignore
        await gmail.users.messages.modify({
          userId: "me",
          id: message.id,
          requestBody: {
            addLabelIds: [labelId],
            removeLabelIds: ["UNREAD"],
          },
        });

        // @ts-ignore
        await sendReply(auth, email?.data as GmailMessage, analysis.suggested_response);

        console.log("→ Successfully processed email");
        console.log("→ Analysis:", analysis);
        console.log("\n--- Waiting for new Email analysis.. ---");
      } catch (error) {
        console.error(
          "→ Error processing this email:",
          error instanceof Error ? error.message : "Unknown error"
        );
        continue;
      }
    }

    if (CHECK_POST_CURRENT_TIME) {
      await updateLastProcessedTime(Date.now());
    }
  } catch (error) {
    console.error("Error in processNewEmails:", error);
  }
}

export { getOrCreateLabel, sendReply, processNewEmails };
