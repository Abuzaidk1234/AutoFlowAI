# AutoFlowAI Startup & Testing Guide

This guide provides the complete, step-by-step instructions to start all components of the AutoFlowAI platform on your local machine.

## Step 0: Start Local AI Engine (Ollama)
Before starting the apps, make sure your local AI is running.
1. Open a new terminal or command prompt.
2. Ensure you have Ollama running in the background. If you need to manually start your preferred model (e.g., qwen):
   ```powershell
   ollama run qwen3:4b
   ```
   *(Or whatever specific Qwen/Llama model you are using. Keep this running or ensure the Ollama system service is active).*

---

## Terminal 1: Start the Python Backend Server
This runs the core API, RAG manager, and database endpoints on port `8000`.

1. Open **Terminal 1** (PowerShell).
2. Navigate to the backend agent directory:
   ```powershell
   cd F:\Project\AutoFlowAi26-main\AutoFlowAi26-main\open-mcp-client\agent
   ```
3. Activate the Python virtual environment:
   ```powershell
   .\.venv\Scripts\activate
   ```
4. Start the server using Uvicorn:
   ```powershell
   uvicorn server:app --host 127.0.0.1 --port 8000
   ```
   *(Wait until you see "Application startup complete". Leave this terminal open.)*

---

## Terminal 2: Start the Next.js Admin Dashboard
This runs the web-based administrative UI (User Management, Tasks, etc.).

1. Open **Terminal 2** (PowerShell).
2. Navigate to the Next.js project directory:
   ```powershell
   cd F:\Project\AutoFlowAi26-main\AutoFlowAi26-main\open-mcp-client
   ```
3. Start the development server:
   ```powershell
   pnpm run dev-frontend
   ```
   *(Or if you prefer npm: `npm run dev-frontend`). Wait for it to compile and open `http://localhost:3000` in your web browser to view the Admin Dashboard.*

---

## Terminal 3: Start the Electron Chat Interface
This runs the desktop application where you actually chat and interact with the AI agent.

1. Open **Terminal 3** (PowerShell).
2. Navigate to the Electron app directory:
   ```powershell
   cd F:\Project\AutoFlowAi26-main\AutoFlowAi26-main\AutoFlowElectron
   ```
3. Start the Electron desktop app:
   ```powershell
   npm start
   ```
   *(The AutoFlowAI desktop window will pop up. You can now register/login and start using the chat interface!)*

---

### Troubleshooting
- **Login/Register not working in Electron:** Ensure **Terminal 1** (Uvicorn) is running smoothly and doesn't have any errors. The Electron app connects to it explicitly via `http://127.0.0.1:8000`.
- **Missing Models (Status 404):** If the backend complains about `qwen3:4b not found (status code: 404)`, ensure you have actually pulled the model in Ollama via `ollama pull qwen3:4b` or ensure your UI's "Model Preference" matches what you have installed.
