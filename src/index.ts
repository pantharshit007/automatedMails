import path from "path";
import process from "process";
import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import dotenv from "dotenv";

import { authorize } from "./config/config";
import { updateIgnoreList } from "./spamEmail/pattern";
import { processNewEmails } from "./emailProcess/email";

dotenv.config();

// Constants
export const SCOPES: string[] = ["https://www.googleapis.com/auth/gmail.modify"];
export const CREDENTIALS_PATH: string = path.join(process.cwd(), "credentials.json");
export const TOKEN_PATH: string = path.join(process.cwd(), "tokens", "token.json");
export const CHECK_POST_CURRENT_TIME: boolean = false;
export const MAX_MAIL: number = 10;
export const SENDERS_NAME: string = "Jethiya";
export const INTERVAL: number = 2 * 60 * 1000; // 2 minutes

// Gemini AI configuration
const apiKey: string = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);
const GEMINI_MODEL = ["gemini-1.5-flash", "gemini-1.5-pro"];
export const model: GenerativeModel = genAI.getGenerativeModel({ model: GEMINI_MODEL[1] });

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
