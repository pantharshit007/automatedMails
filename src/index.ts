// Type definitions
interface EmailAnalysis {
  label: "Interested" | "Not Interested" | "More Information";
  analysis: string;
  suggested_response: string;
}

interface GmailMessageHeader {
  name: string;
  value: string;
}

interface GmailMessage {
  id: string;
  threadId: string;
  payload: {
    headers: GmailMessageHeader[];
    parts?: {
      mimeType: string;
      body: {
        data: string;
      };
    }[];
    body: {
      data: string;
    };
  };
}

interface EmailBody {
  config: { [key: string]: string };
  data: {
    id: string;
    threadId: string;
    labelIds: string[];
    snippet: string;
    payload: {
      partId: string;
      mimeType: string;
      filename: string;
      headers: { [key: string]: string }[];
      body: { [key: string]: any };
      parts: { [key: string]: any }[];
    };
    sizeEstimate: number;
    historyId: string;
    internalDate: number;
  };
  headers: {
    [key: string]: string;
  };
  status: number;
  statusText: string;
  request: {
    responseURL: string;
  };
}

interface GmailLabel {
  id: string;
  name: string;
}

// Import statements
import { promises as fs } from "fs";
import path from "path";
import process from "process";
import { authenticate } from "@google-cloud/local-auth";
import { google, gmail_v1 } from "googleapis";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  GenerativeModel,
  ChatSession,
} from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

// Constants
const SCOPES: string[] = ["https://www.googleapis.com/auth/gmail.modify"];
const CREDENTIALS_PATH: string = path.join(process.cwd(), "credentials.json");
const TOKEN_PATH: string = path.join(process.cwd(), "tokens", "token.json");
const CHECK_POST_CURRENT_TIME: boolean = false;
const MAX_MAIL: number = 2;
const SENDERS_NAME: string = "Jethiya";
const INTERVAL: number = 2 * 60 * 1000; // 2 minutes
const GEMINI_MODEL = ["gemini-1.5-flash", "gemini-1.5-pro"];

// Gemini AI configuration
const apiKey: string = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);
const model: GenerativeModel = genAI.getGenerativeModel({ model: GEMINI_MODEL[1] });

const generationConfig = {
  temperature: 0.7,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 8192,
};

// Gmail authentication functions
async function loadSavedCredentialsIfExist(): Promise<any> {
  try {
    const content = await fs.readFile(TOKEN_PATH, "utf8");
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

async function saveCredentials(client: any): Promise<void> {
  const content = await fs.readFile(CREDENTIALS_PATH, "utf8");
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

async function authorize(): Promise<any> {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

// Email analysis function
async function analyzeEmail(
  emailContent: string,
  from: string,
  to: string
): Promise<EmailAnalysis> {
  const prompt = `
        Analyze the following email content and provide:
        1. A suggested label (choose from: Interested, Not Interested, More Information)
        2. A draft response (keep it small) based on the following rules:
        - If they show interest, suggest a demo call with specific time slots around afternoon
        - If they need more information, provide relevant details
        - If not interested, send a polite acknowledgment
        
        From:
        ${from}
        To (me):
        ${to} or ${SENDERS_NAME}
        Email content:
        ${emailContent}

        Respond in JSON format:
        {
        "label": "chosen_label",
        "analysis": "brief explanation of why this label was chosen",
        "suggested_response": "complete response text"
        }
    `;

  const chatSession: ChatSession = model.startChat({
    generationConfig,
    history: [],
  });

  const result = await chatSession.sendMessage(prompt);
  const responseText = result.response
    .text()
    .replace(/^[\s\S]*?{/, "{")
    .replace(/}[\s\S]*$/, "}");
  // .trim()

  try {
    const metadata = result.response.usageMetadata;
    console.log("→ Analyze Result Metadata:", metadata);
    return JSON.parse(responseText) as EmailAnalysis;
  } catch (error) {
    console.error("> JSON parsing error:", responseText);
    throw new Error(error instanceof Error ? error.message : "Failed to JSON parse email");
  }
}

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

// fetch Ignore email pattern
async function getIgnorePatterns(): Promise<string[]> {
  const ignorePatternPath = path.join(process.cwd(), "ignore_patterns.json");

  try {
    const content = await fs.readFile(ignorePatternPath, "utf8");
    return JSON.parse(content);
  } catch (err) {
    console.error("Error reading ignore patterns:", err);
    return [];
  }
}

// Email filtering
function shouldIgnoreEmail(emailFrom: string): Promise<boolean> {
  return (async () => {
    const ignoreDomains: string[] = (await getIgnorePatterns()) || [];
    return ignoreDomains.some((pattern) => emailFrom.toLowerCase().includes(pattern.toLowerCase()));
  })();
}

// Timestamp management
async function getLastProcessedTime(): Promise<number> {
  const timestampPath = path.join(process.cwd(), "last_processed.txt");
  try {
    const timestamp = await fs.readFile(timestampPath, "utf8");
    return parseInt(timestamp);
  } catch (err) {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    await fs.writeFile(timestampPath, fiveMinutesAgo.toString());
    return fiveMinutesAgo;
  }
}

async function updateLastProcessedTime(timestamp: number): Promise<void> {
  const timestampPath = path.join(process.cwd(), "last_processed.txt");
  await fs.writeFile(timestampPath, timestamp.toString());
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

// Ignore list management
async function updateIgnoreList(newPatterns: string[]): Promise<string[]> {
  try {
    const ignorePatternsPath = path.join(process.cwd(), "ignore_patterns.json");

    let currentPatterns: string[] = [];
    try {
      const content = await fs.readFile(ignorePatternsPath, "utf8");
      currentPatterns = JSON.parse(content);
    } catch (err) {
      await fs.writeFile(ignorePatternsPath, JSON.stringify(newPatterns, null, 2));
      console.log("> New ignored patterns file created:", ignorePatternsPath);
    }

    const updatedPatterns = [...new Set([...currentPatterns, ...newPatterns])];
    await fs.writeFile(ignorePatternsPath, JSON.stringify(updatedPatterns, null, 2));

    console.log("> Updated ignore patterns:", updatedPatterns);
    return updatedPatterns;
  } catch (error) {
    console.error("Error updating ignore patterns:", error);
    throw error;
  }
}

// Main execution
async function main(): Promise<void> {
  if (!process.env.GEMINI_API_KEY) {
    console.error("Error: GEMINI_API_KEY is not set in environment variables");
    process.exit(1);
  }

  try {
    const auth = await authorize();

    console.log("\n> Worker started...");
    console.log("> Checking for new emails every 2 minutes");

    await updateIgnoreList(["noreply@glassdoor.com", "noreply@reddit.com"]);
    await processNewEmails(auth);

    console.log("\n--- New Analysis in every 2 minutes ---");

    const intervalId = setInterval(async () => {
      console.log("\n--- Checking for new emails ---");

      await processNewEmails(auth);

      console.log("\n--- New Analysis in every 2 minutes ---");
    }, INTERVAL);

    setTimeout(() => {
      clearInterval(intervalId);
      console.log("> Worker stopped after 5 minutes.");
    }, 5 * 60 * 1000);
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Error handling
process.on("SIGINT", () => {
  console.log("\n> Worker stopped!");
  process.exit();
});

process.on("unhandledRejection", (error: Error) => {
  console.error("Unhandled rejection:", error);
});

main();
