# AutoFlowAI Comprehensive Testing Guide

This document outlines step-by-step instructions for testing every major capability of the AutoFlowAI platform. Follow these steps to demonstrate the power of your agentic system.

---

## 1. Setup & Configuration Check
Before testing, ensure you have properly configured the necessary credentials in the **Settings** tab of the Electron App:
- **Model Preference:** Choose "Local" (if you want offline Ollama) or "Cloud" (if you want Gemini). If using Cloud, enter your Gemini API Key and click "Save API Key".
- **Email Credentials:** Enter your SMTP server (e.g., `smtp.gmail.com`), port (`587`), your email address, and an App Password. Click "Save Credentials".

---

## 2. Basic Conversational AI
**Goal:** Verify basic communication and model routing.
1. Go to the **Chat** tab.
2. **Prompt:** `"Hello! What are your main capabilities?"`
3. **Expected Result:** The AI should respond naturally and describe its abilities to manage tasks, send emails, search the web, and read files.

---

## 3. Web Search & External Knowledge (Tavily MCP)
**Goal:** Test the AI's ability to fetch real-time data from the internet.
1. **Prompt:** `"Search the web and tell me the current price of Bitcoin."` or `"Who won the most recent Super Bowl?"`
2. **Expected Result:** The AI will trigger the Tavily Search tool, fetch the latest data from the web, and present you with up-to-date, cited information.

---

## 4. Advanced Mathematics (Math MCP)
**Goal:** Test the AI's ability to use a calculator for complex math instead of guessing.
1. **Prompt:** `"Calculate the square root of 987654321 and multiply it by 45.67."`
2. **Expected Result:** The AI will invoke the mathematical MCP tool and return the exact, precise calculation.

---

## 5. Organizational RAG (Knowledge Base)
**Goal:** Verify that the AI can read and answer questions about internal organizational documents.
1. Ensure you have files (like `CompanyPolicy.txt` or `Onboarding_Guide.md`) inside the `open-mcp-client/agent/org_filesystem` folder. (You can see them in the Knowledge Tab).
2. **Prompt:** `"Based on our internal company documents, what is the policy on remote work?"`
3. **Expected Result:** The AI will search the internal Vector Database (Chroma/Qdrant) and answer strictly based on the provided company policy text.

---

## 6. Local File System Management (Electron MCP)
**Goal:** Prove the AI can remotely read and write files directly to your local computer's `AutoFlowData` folder via the Ngrok secure tunnel.
1. **Prompt:** `"List the files in my local AutoFlowData directory."`
2. **Expected Result:** The AI reads the directory and tells you what's inside.
3. **Prompt:** `"Create a new file called 'hello_world.txt' in my local directory with a Python script that prints 'Hello World'."`
4. **Expected Result:** The AI will write the file. You can verify this by checking the `AutoFlowElectron/AutoFlowData` folder on your computer!

---

## 7. Email Automation
**Goal:** Test the AI's ability to send emails on your behalf using the SMTP setup.
1. **Prompt:** `"Send a short email to [Your Personal Email Address] welcoming them to AutoFlowAI."`
2. **Expected Result:** The AI will draft the email and use the SMTP tool to dispatch it. Check your inbox to verify you received it!

---

## 8. Scheduled Tasks & Reminders (Cron/Background Jobs)
**Goal:** Verify the AI can schedule tasks in the future without you keeping the chat open.
1. **Prompt:** `"Schedule a task to remind me to drink water in 1 minute."`
2. **Expected Result:** The AI will record this in the `scheduled_tasks` database. Exactly one minute later, the System Scheduled Tasks processor will trigger, and the AI will generate a notification or follow up. (You can view pending scheduled tasks in the Next.js Admin Dashboard!)

---

## 9. Admin Dashboard Management (Next.js)
**Goal:** Verify the web-based command center reflects real-time activity.
1. Open your web browser to `http://localhost:3000` (Terminal 2).
2. Check the **User Management** tab to see your newly registered user account.
3. Check the **System Scheduled Tasks** tab to monitor background jobs created in the previous step.
