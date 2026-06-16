# AutoFlowAI 🤖

AutoFlowAI is a powerful, secure, and extensible local AI Agent architecture. It features a React-based frontend dashboard, an advanced LangGraph Python backend, and a robust Model Context Protocol (MCP) toolset. It is designed to safely interact with local files, query organizational knowledge, schedule background tasks, and automate workflows like sending emails.

---

## 🚀 Key Features

* **Organizational Knowledge Base (RAG):** Secure, read-only vector database (ChromaDB) for querying company policies, onboarding guides, and internal documentation.
* **Personal Data Sandbox:** A secure, isolated directory (`AutoFlowData`) where the AI can safely create, read, and delete temporary user files without risking system integrity.
* **Automated Emailing:** Built-in SMTP tool allowing the AI to construct emails and securely attach documents from both the knowledge base and the local sandbox.
* **Scheduled Background Tasks:** Instruct the AI to run tasks dynamically at future dates or on recurring intervals.
* **Model Context Protocol (MCP):** An easily extensible tool architecture allowing the AI to dynamically discover and use new tools (Web Search, Math Operations, File Management, etc.).

---

## 💻 Tech Stack

**Frontend Dashboard:**
* Next.js (React)
* TailwindCSS
* Turbopack

**Backend AI Agent:**
* Python & FastAPI
* LangChain & LangGraph (Agentic Workflow)
* ChromaDB (Vector Database for RAG)
* SQLite (Local database for credentials and configurations)

**Desktop Wrapper:**
* Electron.js (For native desktop framing)

---

## 🛠️ Setup Guide

Follow these steps to run AutoFlowAI locally.

### 1. Backend Server Setup (Python)
The backend powers the agent's logic, memory, and tools.

```bash
cd open-mcp-client/agent

# Create a virtual environment and install dependencies
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt # (or use uv sync / poetry install depending on your package manager)

# Set up your environment variables
# Create a .env file in the `agent` folder and add your API Keys:
# GEMINI_API_KEY=your_google_gemini_key
# OPENAI_API_KEY=your_openai_key_if_preferred

# Start the Python FastAPI backend
uvicorn server:app --host 0.0.0.0 --port 8000
```

### 2. Frontend Dashboard Setup (Next.js)
The frontend provides the chat interface, MCP tool configurations, and system task views.

```bash
cd open-mcp-client

# Install Node dependencies
npm install

# Start the Next.js development server
npm run dev
```

The dashboard will be available at [http://localhost:3000](http://localhost:3000).

### 3. Desktop Application (Optional)
If you prefer to run the application as a standalone desktop app instead of in the browser:

```bash
cd AutoFlowElectron

# Install dependencies
npm install

# Launch the Electron app
npm start
```

---

## 💡 Example Usage

Once the servers are running, open the dashboard and try sending these natural language prompts to your AI:

* **File Analysis:** *"Read the project specs from the organizational docs and give me a 3-bullet point summary."*
* **Email Automation:** *"Email john@example.com right now. Attach the `Onboarding_Guide.md` from the knowledge base and `hello.txt` from my local files."*
* **Scheduling:** *"Schedule a task to search the web for the latest AI news every morning at 9 AM."*
* **Sandbox Management:** *"Create a new file in my local folder called `research.txt` and save your findings there."*

---

## 🔒 Security Architecture

AutoFlowAI uses a strict dual-filesystem approach to guarantee data safety:
1. **Org Filesystem (`org_filesystem`):** Strictly **Read-Only** for the AI. Can only be uploaded to or deleted from via the Admin Dashboard.
2. **Local Sandbox (`AutoFlowData`):** A heavily restricted folder where the AI is permitted to perform Read/Write/Delete operations for temporary workspace needs. Any attempts by the AI to modify files outside this directory are hard-blocked by the backend.
