<h1 align="center">Gmail AI Assistant</h1>

An automated email response system powered by Google's Gemini AI that intelligently processes and responds to emails based on their content.

## 🌟 Features

- **Automated Email Analysis**: Uses Gemini AI to analyze incoming emails and categorize them
- **Smart Categorization**: Automatically labels emails as "Interested", "Not Interested", or "More Information"
- **Automated Responses**: Generates contextual responses based on email content
- **Spam/Automation Filter**: Automatically filters out automated emails and notifications
- **Gmail Integration**: Seamlessly works with Gmail using official APIs
- **Label Management**: Creates and manages Gmail labels automatically
- **Rate Limiting**: Processes a configurable number of emails per check
- **Interval Processing**: Checks for new emails at regular intervals

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- TypeScript
- Gmail Account
- Google Cloud Project with Gmail API enabled
- Gemini API Key

### Installation

1. Clone the repository:

```bash
git clone https://github.com/pantharshit007/automatedMails.git
cd automatedMails
```

2. Install dependencies:

```bash
npm install
```

3. Create necessary directories:

```bash
mkdir tokens
```

4. Set up environment variables:
   Create a `.env` file in the root directory:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

5. Set up Google Cloud credentials:
   - Create a project in Google Cloud Console
   - Enable Gmail API
   - Create OAuth 2.0 credentials
   - Download the credentials and save as `credentials.json` in the project root

### Configuration

1. Update the constants in `src/index.ts` if needed:

```typescript
const MAX_MAIL: number = 2; // Maximum emails to process per check
const SENDERS_NAME: string = "Your Name"; // Your name for email signatures
const INTERVAL: number = 2 * 60 * 1000; // Check interval (2 minutes)
```

2. Customize ignore patterns:
   Edit the `ignore_patterns.json` file to add/remove email patterns to ignore.

## 🛠️ Development

Run in development mode:

```bash
npm run dev
```

Build the project:

```bash
npm run build
```

Start the built version:

```bash
npm start
```

You can also use script.js instead

```bash
node src/script.js
```

## 📁 Project Structure (temp)

```
├── src/
│   └── index.ts
├── dist/
├── credentials.json
├── tokens/
│   └── token.json
├── last_processed.txt
└── ignore_patterns.json
```

> [!IMPORTANT]  
> Keep your `credentials.json`, `token.json` & `.env` file secure

## ⚙️ How It Works

1. **Authentication**:

   - Uses OAuth 2.0 for Gmail API authentication
   - Stores and manages tokens automatically

2. **Email Processing**:

   - Checks for unread emails at regular intervals
   - Filters out automated emails based on ignore patterns
   - Extracts email content for analysis

3. **AI Analysis**:

   - Uses Gemini AI to analyze email content
   - Determines the appropriate category and response
   - Generates contextual replies

4. **Response Handling**:
   - Applies appropriate labels to emails
   - Sends automated responses
   - Marks emails as read
   - Updates processing timestamps

## ⚠️ Limitations

- Maximum email processing limit per check
- Rate limiting based on Gmail API quotas
- Depends on Gemini AI API availability
- Limited to text-based email content analysis (somewhat)
