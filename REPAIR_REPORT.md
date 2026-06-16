# AutoFlowAI Repair Report

## 1. Project Understanding

According to `AutoFlow_Research_Paper.pdf` and `Report.pdf`, AutoFlowAI is a desktop-plus-service workflow automation system. The intended stack is:

- Electron desktop client for login, chat, knowledge, scheduled tasks, MCP server management, and settings.
- FastAPI backend exposing authentication, `/agent/stream`, file management, task management, user preferences, and MCP configuration.
- LangGraph ReAct runtime with thread-scoped state.
- Native tools for `schedule_task` and `search_knowledge_base`.
- MCP tools for email, math, web search, and optionally user-registered STDIO/SSE servers.
- SQLite for users, credentials, preferences, and scheduled tasks.
- Chroma plus FastEmbed/Gemini embeddings for organizational document retrieval.
- APScheduler for background execution of due tasks.
- Local Ollama `qwen3:4b` mode, with Gemini 2.5 Flash cloud mode when a per-user Gemini key is configured.

The required workflow is: user natural-language request -> Electron UI -> FastAPI `/agent/stream` -> LangGraph model/tool loop -> native and MCP tools -> streamed NDJSON response. Scheduled work uses the same LangGraph workflow in background mode.

## 2. Issues Found

- Backend dependency metadata did not include all imported runtime modules in the Poetry dependency section.
- Editable install failed because setuptools tried to package data directories (`chroma_db`, `org_filesystem`) as Python packages.
- `langchain-mcp-adapters` was too loosely constrained; pip selected a newer incompatible adapter.
- `AutoFlowElectron/main.js` imported `zod`, but Electron `package.json` did not declare it directly.
- `tavily_server.py` contained a hardcoded Tavily API key.
- `server.py` contained commented API-key examples.
- `/api/tasks/{task_id}` delete route was missing even though the dashboard called it.
- Default MCP configuration omitted the web-search MCP server.
- `search_knowledge_base` was not explicitly registered as a LangChain tool.
- Email attachment handling was not atomic; it could send email even when requested attachments were missing or blocked.
- Email MCP calls could fall back to the wrong user when the model omitted `username`.
- Windows console encoding could crash `/agent/stream` when log messages contained Unicode symbols.
- Missing Ollama model produced raw technical errors instead of clear setup guidance.
- Organizational files could be re-indexed repeatedly into Chroma on every startup.
- Org file upload/delete and Electron filesystem MCP path checks needed stricter path containment.
- No `.env.example` files documented the expected environment variables.

## 3. Fixes Applied

- Updated `open-mcp-client/agent/pyproject.toml` with complete runtime dependencies, pinned `langchain-mcp-adapters==0.0.3`, and added explicit setuptools package/module discovery.
- Added `open-mcp-client/agent/.env.example` and `open-mcp-client/.env.example`.
- Added `zod` to `AutoFlowElectron/package.json` and the root package-lock dependency list.
- Removed hardcoded Tavily/API-key material and made `TAVILY_API_KEY` environment-driven.
- Added `web_search` to backend and graph default MCP server configuration.
- Added `/api/tasks/{task_id}` deletion.
- Added validation for model preference and MCP server creation payloads.
- Added safe org file path resolution for upload/delete.
- Added UTF-8 tolerant stdout/stderr configuration for backend and agent modules.
- Decorated `search_knowledge_base` with `@tool`.
- Injected current user context for email MCP subprocesses and instructed the model to pass `username`.
- Made email-with-attachment behavior atomic: missing/blocked attachments stop the send.
- Made model/runtime fallback messages explain how to start Ollama or configure Gemini.
- Made RAG re-indexing remove old chunks for the same filename before adding new chunks.
- Hardened Electron filesystem MCP path containment and added local SSE fallback when ngrok fails.

## 4. Remaining Limitations

- Real email delivery requires valid SMTP credentials saved in the Electron Settings panel or provided through `agent/.env`.
- Gemini cloud execution requires a valid Gemini API key saved per user in Settings or set as `GEMINI_API_KEY`.
- Web search requires `TAVILY_API_KEY`.
- Local model execution requires Ollama running with `qwen3:4b` pulled.
- Electron and Next package installation could not be fully executed in this environment because `npm`/`pnpm` are not installed on PATH here; JavaScript syntax checks passed with the bundled Node runtime.
- The first local RAG startup downloads the FastEmbed model from Hugging Face; after that warmup, local embeddings can use the cache.

## 5. Setup Instructions

Backend:

```powershell
cd F:\Project\AutoFlowAi26-main\AutoFlowAi26-main\open-mcp-client\agent
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -e .
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn server:app --host 127.0.0.1 --port 8000
```

Local model:

```powershell
ollama pull qwen3:4b
ollama serve
```

Electron desktop client:

```powershell
cd F:\Project\AutoFlowAi26-main\AutoFlowAi26-main\AutoFlowElectron
npm install
npm start
```

Optional Next dashboard:

```powershell
cd F:\Project\AutoFlowAi26-main\AutoFlowAi26-main\open-mcp-client
pnpm install
pnpm run dev-frontend
```

## 6. Required Environment Variables

Required only for specific integrations:

- `GEMINI_API_KEY`: optional cloud model fallback and optional cloud embeddings.
- `GOOGLE_API_KEY`: optional alias for cloud embeddings.
- `TAVILY_API_KEY`: required for `web_search`.
- `SMTP_SERVER`: optional SMTP fallback, default is `smtp.gmail.com`.
- `SMTP_PORT`: optional SMTP fallback, default is `587`.
- `SENDER_EMAIL`: optional SMTP fallback.
- `SENDER_PASSWORD`: optional SMTP fallback.
- `LANGSMITH_API_KEY`: optional tracing/dev tooling.
- `OPENAI_API_KEY`: optional Next/CopilotKit route.
- `AGENT_DEPLOYMENT_URL`: optional Next/CopilotKit LangGraph endpoint, default `http://localhost:8123`.

Preferred credential path:

- Store Gemini and SMTP credentials per user from the Electron Settings panel. They are saved in SQLite and loaded at request time.

## 7. Run Verification

Executed validation:

- `pip install -e .` in `open-mcp-client/agent/.venv`: passed.
- Python compilation for backend/tool modules: passed.
- `import server` and `from sample_agent.agent import graph`: passed.
- `init_db()`: passed.
- FastAPI startup on a test port: passed.
- Health endpoint `/`: returned `{"status":"ok"}`.
- Auth register/login: passed.
- User preference update: passed.
- `/api/tasks`: returned task list.
- `/api/mcp/servers`: returned `math,email,web_search`.
- `/agent/stream` without Ollama model: returned HTTP 200 with clear setup message instead of crashing.
- `schedule_task` direct invocation: created a pending task and survived missing local model during optional rephrase.
- `send_email` without SMTP credentials: returned clear missing-credential message.
- `web_search` without Tavily key: returned clear missing-key message.
- `add` and `multiply` math tools: returned correct results.
- Electron `main.js` and `renderer.js` syntax checks with Node: passed.
