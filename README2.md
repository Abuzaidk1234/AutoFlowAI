# AutoFlowAI

AutoFlowAI is a powerful desktop-plus-service workflow automation system powered by local and cloud LLMs. It combines an Electron-based desktop client with a robust FastAPI + LangGraph backend to provide natural language-driven automation, scheduled tasks, knowledge base retrieval (RAG), and extensive tool integrations via the Model Context Protocol (MCP).

## 🚀 Features

- **Desktop Client:** Electron-based UI for chat, knowledge management, scheduled tasks, settings, and MCP server configuration.
- **Agentic Backend:** FastAPI backend running a LangGraph ReAct runtime with thread-scoped state.
- **Local & Cloud LLMs:** Runs locally using Ollama (`qwen3:4b` by default) for privacy, with seamless fallback to Gemini 2.5 Flash when a Gemini API key is configured.
- **RAG & Knowledge Base:** Built-in Chroma vector database using FastEmbed or Gemini embeddings for organizational document retrieval.
- **Scheduled Tasks:** Integrated APScheduler for background execution of natural language tasks at specified times.
- **MCP Integration:** Extensible tool ecosystem via the Model Context Protocol. Built-in tools include email sending, math operations, and web search (Tavily). Supports user-registered STDIO/SSE servers.
- **Optional Web Dashboard:** Next.js-based web interface for additional monitoring and control.

## 💻 Tech Stack

**Frontend & Apps:**
- **Desktop:** Electron, HTML/CSS/JS
- **Web Dashboard:** Next.js, React

**Backend & AI:**
- **Server:** FastAPI, Python
- **AI Agent Framework:** LangGraph ReAct Agent
- **Tools/Extensibility:** Model Context Protocol (MCP)

**Models & Embeddings:**
- **Local Models:** Ollama (`qwen3:4b` default)
- **Cloud Models:** Google Gemini 2.5 Flash
- **Embeddings:** FastEmbed (local), Gemini Embeddings (cloud)

**Data & Storage:**
- **Relational DB:** SQLite
- **Vector DB:** ChromaDB
- **Task Scheduler:** APScheduler

## 🏗️ Architecture

- **`AutoFlowElectron/`**: Electron desktop application.
- **`open-mcp-client/agent/`**: FastAPI backend and LangGraph agent workflow.
- **`open-mcp-client/`**: Next.js optional web dashboard.
- **Databases**: SQLite (users, credentials, preferences, scheduled tasks) and ChromaDB (document embeddings).

## 🛠️ Setup Instructions

### 1. Backend (FastAPI + LangGraph)

```powershell
cd open-mcp-client\agent
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -e .
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn server:app --host 127.0.0.1 --port 8000
```

### 2. Local Model (Ollama)
For local, privacy-first execution, ensure Ollama is installed and running:
```powershell
ollama pull qwen3:4b
ollama serve
```
*(The first local RAG startup will also download the FastEmbed model from Hugging Face for document embeddings).*

### 3. Electron Desktop Client

```powershell
cd AutoFlowElectron
npm install
npm start
```

### 4. Optional Next.js Dashboard

```powershell
cd open-mcp-client
pnpm install
pnpm run dev-frontend
```

## ⚙️ Configuration & Environment Variables

Most credentials (like Gemini API keys and SMTP settings) can be configured securely per user directly from the **Electron Settings panel** and are stored locally in SQLite.

If using environment variables, configure them in `open-mcp-client/agent/.env`:
- `GEMINI_API_KEY`: Optional cloud model fallback and cloud embeddings.
- `TAVILY_API_KEY`: Required for `web_search` MCP tool.
- `SMTP_SERVER` / `SMTP_PORT` / `SENDER_EMAIL` / `SENDER_PASSWORD`: Optional SMTP fallback for email tools (defaults to `smtp.gmail.com:587`).
- `LANGSMITH_API_KEY`: Optional for tracing and debugging.
- `AGENT_DEPLOYMENT_URL`: Optional Next/CopilotKit LangGraph endpoint (default `http://localhost:8123`).

## 📚 Typical Workflow
1. User submits a natural-language request via the Electron UI.
2. The request routes to the FastAPI backend (`/agent/stream`).
3. The LangGraph model/tool loop processes the request.
4. The agent leverages native tools (e.g., `schedule_task`, `search_knowledge_base`) and MCP tools (email, web search, etc.).
5. Results are streamed back to the UI in real-time.
