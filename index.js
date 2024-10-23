const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');
const {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
} = require("@google/generative-ai");
require('dotenv').config();

// Gmail API configuration
const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

// Gemini AI configuration
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const generationConfig = {
    temperature: 0.7,
    topP: 0.95,
    topK: 64,
    maxOutputTokens: 8192,
};

const CHECK_POST_CURRENT_TIME = false;

// Gmail authentication functions
async function loadSavedCredentialsIfExist() {
    try {
        const content = await fs.readFile(TOKEN_PATH);
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        return null;
    }
}

async function saveCredentials(client) {
    const content = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });
    await fs.writeFile(TOKEN_PATH, payload);
}

async function authorize() {
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

// Function to analyze email content using Gemini AI
async function analyzeEmail(emailContent) {
    const prompt = `
    Analyze the following email content and provide:
    1. A suggested label (choose from: Interested, Not Interested, More Information)
    2. A draft response based on the following rules (keep it small):
       - If they show interest, suggest a demo call with specific time slots
       - If they need more information, provide relevant details
       - If not interested, send a polite acknowledgment
    
    Email content:
    ${emailContent}

    Respond in JSON format:
    {
      "label": "chosen_label",
      "analysis": "brief explanation of why this label was chosen",
      "suggested_response": "complete response text"
    }
  `;

    const chatSession = model.startChat({
        generationConfig,
        history: [],
    });

    const result = await chatSession.sendMessage(prompt);
    console.log('> AI Response:', result.response.text());
    return JSON.parse(result.response.text());
}

// Function to create or get Gmail label
async function getOrCreateLabel(auth, labelName) {
    const gmail = google.gmail({ version: 'v1', auth });

    try {
        const res = await gmail.users.labels.list({ userId: 'me' });
        const existingLabel = res.data.labels.find(label => label.name === labelName);

        if (existingLabel) {
            return existingLabel.id;
        }

        const newLabel = await gmail.users.labels.create({
            userId: 'me',
            requestBody: {
                name: labelName,
                labelListVisibility: 'labelShow',
                messageListVisibility: 'show',
            },
        });

        return newLabel.data.id;
    } catch (error) {
        console.error('Error managing label:', error);
        throw error;
    }
}

// Function to send email reply
async function sendReply(auth, originalMessage, replyText) {
    const gmail = google.gmail({ version: 'v1', auth });

    // Get original message details
    const email = await gmail.users.messages.get({
        userId: 'me',
        id: originalMessage.id,
        format: 'full',
    });

    const headers = email.data.payload.headers;
    const subject = headers.find(header => header.name === 'Subject')?.value;
    const from = headers.find(header => header.name === 'From')?.value;
    const messageId = headers.find(header => header.name === 'Message-ID')?.value;

    // Create reply email
    const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
    const emailContent = `From: me
To: ${from}
Subject: ${replySubject}
In-Reply-To: ${messageId}
References: ${messageId}
Content-Type: text/plain; charset="UTF-8"

${replyText}`;

    // Encode the email in base64
    const encodedEmail = Buffer.from(emailContent)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    // Send the email
    await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
            raw: encodedEmail,
            threadId: originalMessage.threadId,
        },
    });
}

// Ignore these domains
function shouldIgnoreEmail(emailFrom) {
    // Common patterns to ignore
    const ignoreDomains = [
        'notifications',
        'noreply',
        'no-reply',
        'yes-reply',
        'hello',
        'informer',
        'info@',
        'daily.dev',
        'duolingo.com',
        'glassdoor.com',
        'freelancer.com',
        'beefree.io',
        'vercel.com',
        'disqus.com'
    ];

    // Convert email to lowercase for case-insensitive matching
    emailFrom = emailFrom.toLowerCase();

    // Check if the email contains any of the ignore patterns
    return ignoreDomains.some(pattern => emailFrom.includes(pattern));
}

// Add a function to store the last processed timestamp
async function getLastProcessedTime() {
    const timestampPath = path.join(process.cwd(), 'last_processed.txt');
    try {
        const timestamp = await fs.readFile(timestampPath, 'utf8');
        return parseInt(timestamp);
    } catch (err) {
        // If file doesn't exist, return a timestamp from 5 minutes ago
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        await fs.writeFile(timestampPath, fiveMinutesAgo.toString());
        return fiveMinutesAgo;
    }
}

async function updateLastProcessedTime(timestamp) {
    const timestampPath = path.join(process.cwd(), 'last_processed.txt');
    await fs.writeFile(timestampPath, timestamp.toString());
}

// Main function to process new emails
async function processNewEmails(auth) {
    const gmail = google.gmail({ version: 'v1', auth });

    try {
        // Prepare query based on the flag
        let query = 'is:unread';

        if (CHECK_POST_CURRENT_TIME) {
            const lastProcessedTime = await getLastProcessedTime();
            const afterDate = new Date(lastProcessedTime).toISOString();
            query += ` after:${afterDate}`;
        }

        // Get messages based on query
        const res = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: 10
        });

        if (!res.data.messages) {
            console.log('No new messages found.');
            if (CHECK_POST_CURRENT_TIME) {
                await updateLastProcessedTime(Date.now());
            }
            return;
        }

        console.log(`Found ${res.data.messages.length} unread messages`);

        for (const message of res.data.messages) {
            // Get full message content
            const email = await gmail.users.messages.get({
                userId: 'me',
                id: message.id,
                format: 'full',
            });

            // Extract sender email and subject
            const headers = email.data.payload.headers;
            const from = headers.find(header => header.name === 'From')?.value || '';
            const subject = headers.find(header => header.name === 'Subject')?.value || '(no subject)';

            console.log(`\nProcessing email from: ${from}`);
            console.log(`Subject: ${subject}`);

            // Check if this email should be ignored
            if (shouldIgnoreEmail(from)) {
                console.log(`→ Ignoring automated email`);

                // Mark as read and archive
                await gmail.users.messages.modify({
                    userId: 'me',
                    id: message.id,
                    requestBody: {
                        removeLabelIds: ['UNREAD', 'INBOX'],
                    },
                });

                continue; // Skip to next email
            }

            // Extract email content
            let emailContent = '';
            if (email.data.payload.parts) {
                // Handle multipart messages
                for (const part of email.data.payload.parts) {
                    if (part.mimeType === 'text/plain' && part.body.data) {
                        emailContent += Buffer.from(part.body.data, 'base64').toString();
                    }
                }
            } else if (email.data.payload.body.data) {
                // Handle single part messages
                emailContent = Buffer.from(email.data.payload.body.data, 'base64').toString();
            }

            if (!emailContent.trim()) {
                console.log('→ No readable content found in email');
                continue;
            }

            try {
                // Analyze email using AI
                console.log('→ Analyzing content with AI...');
                const analysis = await analyzeEmail(emailContent);

                // Get or create label
                const labelId = await getOrCreateLabel(auth, analysis.label);

                // Apply label
                await gmail.users.messages.modify({
                    userId: 'me',
                    id: message.id,
                    requestBody: {
                        addLabelIds: [labelId],
                        removeLabelIds: ['UNREAD'],
                    },
                });

                // Send automated response
                await sendReply(auth, email.data, analysis.suggested_response);

                console.log('→ Successfully processed email');
                console.log('→ Analysis:', analysis);
            } catch (error) {
                console.error('→ Error processing this email:', error.message);
                continue; // Skip to next email if there's an error
            }
        }

        // Update timestamp only if we're checking for it
        if (CHECK_POST_CURRENT_TIME) {
            await updateLastProcessedTime(Date.now());
        }

    } catch (error) {
        console.error('Error in processNewEmails:', error);
    }
}

// manage the ignore list
async function updateIgnoreList(newPatterns) {
    try {
        const ignorePatternsPath = path.join(process.cwd(), 'ignore_patterns.json');

        // Load existing patterns or create new file
        let currentPatterns = [];
        try {
            const content = await fs.readFile(ignorePatternsPath);
            currentPatterns = JSON.parse(content);
        } catch (err) {
            // File doesn't exist yet, will create a new one
            await fs.writeFile(ignorePatternsPath, JSON.stringify(newPatterns, null, 2));
            console.log('> New ignored patterns file created:', ignorePatternsPath);
        }

        // Add new patterns
        const updatedPatterns = [...new Set([...currentPatterns, ...newPatterns])];

        // Save updated patterns
        await fs.writeFile(ignorePatternsPath, JSON.stringify(updatedPatterns, null, 2));

        console.log('> Updated ignore patterns:', updatedPatterns);
        return updatedPatterns;
    } catch (error) {
        console.error('Error updating ignore patterns:', error);
        throw error;
    }
}

// Main execution
async function main() {
    // Verify environment variables
    if (!process.env.GEMINI_API_KEY) {
        console.error('Error: GEMINI_API_KEY is not set in environment variables');
        process.exit(1);
    }

    try {
        const auth = await authorize();

        // Process emails every 2 minutes
        const INTERVAL = 2 * 60 * 1000; // 2 minutes

        console.log('> worker started...');
        console.log('> Checking for new emails every 2 minutes');

        // Initial processing
        await processNewEmails(auth);

        // Set up interval for continued processing
        const intervalId = setInterval(async () => {
            console.log('\n--- Checking for new emails ---');
            await processNewEmails(auth);
        }, INTERVAL);

        setTimeout(() => {
            clearInterval(intervalId);
            console.log('> Worker stopped after 5 minutes.');
        }, 5 * 60 * 1000);

    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});

main();