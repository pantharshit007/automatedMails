import { ChatSession } from "@google/generative-ai";
import { model, SENDERS_NAME } from "..";
import { EmailAnalysis } from "../types";
import { generationConfig } from "../config/config";

// Email analysis function
export async function analyzeEmail(
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
  ``;
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
