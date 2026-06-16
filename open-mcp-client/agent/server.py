from fastapi import FastAPI, HTTPException, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import json
import logging
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from rag_manager import rag_manager
from dotenv import load_dotenv

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("autoflow.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("AutoFlowServer")
# Silence noisy logs (polling and access logs) in terminal
logging.getLogger('apscheduler').setLevel(logging.WARNING)
logging.getLogger("uvicorn.access").setLevel(logging.WARNING) 
import sys
import os
import bcrypt
import asyncio
from typing import Dict, Any, List, Union, Optional
from datetime import datetime

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

from sample_agent.agent import workflow
graph = None
memory_conn = None 
from langchain_core.messages import AIMessage, SystemMessage 
from contextlib import asynccontextmanager
from db import get_db, init_db

class OrgFileEventHandler(FileSystemEventHandler):
    def on_created(self, event):
        if not event.is_directory:
            rag_manager.load_and_index_file(event.src_path)
    def on_deleted(self, event):
        if not event.is_directory:
            rag_manager.remove_from_index(os.path.basename(event.src_path))
    def on_modified(self, event):
        if not event.is_directory:
            # Re-index
            rag_manager.remove_from_index(os.path.basename(event.src_path))
            rag_manager.load_and_index_file(event.src_path)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize DB, Scheduler, and File Watcher
    init_db()
    
    global memory_conn, graph
    from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
    import aiosqlite
    memory_db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "autoflow_memory.db")
    memory_conn = await aiosqlite.connect(memory_db_path, check_same_thread=False)
    memory_saver = AsyncSqliteSaver(memory_conn)
    graph = workflow.compile(checkpointer=memory_saver)
    
    # Silence noisy logs
    import logging as _logging
    _logging.getLogger('apscheduler').setLevel(_logging.WARNING)
    _logging.getLogger("uvicorn.access").setLevel(_logging.WARNING) 

    # Org Filesystem Setup
    org_path = os.path.abspath("./org_filesystem")
    os.makedirs(org_path, exist_ok=True)
    
    # Proactive Initialization: Initialize vector store and scan existing files
    print(f"[SYSTEM] Initializing RAG Knowledge Base and scanning: {org_path}")
    rag_manager.init_vector_store()
    rag_manager.scan_and_index_org_fs()

    event_handler = OrgFileEventHandler()
    observer = Observer()
    observer.schedule(event_handler, org_path, recursive=False)
    observer.start()
    app.state.observer = observer
    print(f"[SYSTEM] Monitoring Org Filesystem at: {org_path}")

    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    scheduler = AsyncIOScheduler()
    scheduler.add_job(poll_scheduled_tasks, 'interval', seconds=10)
    scheduler.start()
    print("[SYSTEM] APScheduler started. Polling every 10s.")
    yield
    # Shutdown
    if hasattr(app.state, "observer"):
        app.state.observer.stop()
        app.state.observer.join()
    scheduler.shutdown()
    if memory_conn:
        await memory_conn.close()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PreferenceRequest(BaseModel):
    username: str
    preferred_model: str

# --- User Preference Endpoints ---
@app.post("/api/user/preference")
async def set_user_preference(req: PreferenceRequest):
    if req.preferred_model not in {"local", "cloud"}:
        raise HTTPException(status_code=400, detail="preferred_model must be 'local' or 'cloud'")
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE username = ?", (req.username,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
    cursor.execute("UPDATE users SET preferred_model = ? WHERE username = ?", (req.preferred_model, req.username))
    conn.commit()
    conn.close()
    return {"status": "success"}

# --- Config & Models ---
class ChatRequest(BaseModel):
    message: str
    thread_id: str = "default_thread"
    username: str = "admin"
    preferred_model: Optional[str] = "cloud"

class MCPServerConfig(BaseModel):
    name: str
    transport: str
    command: Optional[str] = None
    args: List[str] = []
    url: Optional[str] = None
    headers: Dict[str, str] = {}

class AuthRequest(BaseModel):
    username: str
    password: str

class EmailConfigRequest(BaseModel):
    username: str
    smtp_server: str
    smtp_port: int
    sender_email: str
    sender_password: str

class GeminiKeyRequest(BaseModel):
    username: str
    api_key: str

# --- Auth Endpoints ---
@app.post("/auth/register")
async def register(req: AuthRequest):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (req.username,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Username already exists")
    
    hashed = bcrypt.hashpw(req.password.encode('utf-8'), bcrypt.gensalt())
    cursor.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", 
                   (req.username, hashed.decode('utf-8')))
    conn.commit()
    conn.close()
    return {"status": "success", "message": "User registered"}

@app.post("/auth/login")
async def login(req: AuthRequest):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, password_hash FROM users WHERE username = ?", (req.username,))
    user = cursor.fetchone()
    conn.close()
    
    if not user or not bcrypt.checkpw(req.password.encode('utf-8'), user['password_hash'].encode('utf-8')):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"status": "success", "username": req.username, "user_id": user['id']}

@app.post("/api/user/email-config")
async def set_email_config(req: EmailConfigRequest):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE username = ?", (req.username,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
        
    cursor.execute("SELECT * FROM user_credentials WHERE user_id = ?", (user['id'],))
    if cursor.fetchone():
        cursor.execute("""
            UPDATE user_credentials SET smtp_server=?, smtp_port=?, sender_email=?, sender_password=?
            WHERE user_id=?
        """, (req.smtp_server, req.smtp_port, req.sender_email, req.sender_password, user['id']))
    else:
        cursor.execute("""
            INSERT INTO user_credentials (user_id, smtp_server, smtp_port, sender_email, sender_password)
            VALUES (?, ?, ?, ?, ?)
        """, (user['id'], req.smtp_server, req.smtp_port, req.sender_email, req.sender_password))
    conn.commit()
    conn.close()
    return {"status": "success", "message": "Email config saved"}

@app.post("/api/user/gemini-config")
async def set_gemini_config(req: GeminiKeyRequest):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE username = ?", (req.username,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
        
    cursor.execute("SELECT * FROM user_generic_credentials WHERE user_id = ? AND service_name = 'gemini' AND credential_key = 'api_key'", (user['id'],))
    if cursor.fetchone():
        cursor.execute("""
            UPDATE user_generic_credentials SET credential_value=?
            WHERE user_id=? AND service_name='gemini' AND credential_key='api_key'
        """, (req.api_key, user['id']))
    else:
        cursor.execute("""
            INSERT INTO user_generic_credentials (user_id, service_name, credential_key, credential_value)
            VALUES (?, 'gemini', 'api_key', ?)
        """, (user['id'], req.api_key))
    conn.commit()
    conn.close()
    return {"status": "success", "message": "Gemini config saved"}

@app.get("/api/tasks")
async def get_tasks():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT t.id, t.original_prompt, t.execution_time, t.status, t.result_log, u.username FROM scheduled_tasks t JOIN users u ON t.user_id = u.id ORDER BY t.execution_time DESC")
    tasks = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return {"tasks": tasks}

@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM scheduled_tasks WHERE id = ?", (task_id,))
    deleted = cursor.rowcount
    conn.commit()
    conn.close()
    if not deleted:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"status": "success"}

# --- Filesystem Endpoints ---
def _safe_org_file_path(filename: str) -> str:
    base = os.path.abspath("./org_filesystem")
    target = os.path.abspath(os.path.join(base, filename))
    if os.path.commonpath([base, target]) != base:
        raise HTTPException(status_code=400, detail="Invalid filename")
    return target

@app.get("/api/files/org")
async def list_org_files():
    org_path = "./org_filesystem"
    files = []
    if os.path.exists(org_path):
        for f in os.listdir(org_path):
            path = os.path.join(org_path, f)
            if os.path.isfile(path):
                files.append({
                    "name": f,
                    "size": os.path.getsize(path),
                    "modified": os.path.getmtime(path)
                })
    return {"files": files}

@app.post("/api/files/org/upload")
async def upload_org_file(file: bytes = File(...), filename: str = Form(...)):
    org_path = _safe_org_file_path(filename)
    with open(org_path, "wb") as f:
        f.write(file)
    # The watchdog will handle indexing
    return {"status": "success", "filename": filename}

@app.delete("/api/files/org/{filename}")
async def delete_org_file(filename: str):
    org_path = _safe_org_file_path(filename)
    if os.path.exists(org_path):
        os.remove(org_path)
    # The watchdog will handle de-indexing
    return {"status": "success"}

# Local files metadata storage (in-memory or DB)
# For simplicity, we'll store local file refs in a global dict per user for now
local_files_cache = {} # {username: [file_metadata]}

@app.post("/api/files/local/sync")
async def sync_local_files(req: Dict[str, Any]):
    username = req.get("username")
    files = req.get("files", [])
    local_files_cache[username] = files
    return {"status": "success", "count": len(files)}

# --- User Management Endpoints ---
@app.get("/api/users")
async def get_users():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.id, u.username, u.created_at,
               c.smtp_server, c.smtp_port, c.sender_email
        FROM users u
        LEFT JOIN user_credentials c ON c.user_id = u.id
    """)
    rows = cursor.fetchall()
    
    # Also fetch any generic credentials
    users_map = {}
    for row in rows:
        uid = row['id']
        if uid not in users_map:
            users_map[uid] = {
                "id": uid,
                "username": row['username'],
                "created_at": dict(row).get('created_at'),
                "email_config": None,
                "credentials": []
            }
        if row['smtp_server']:
            users_map[uid]['email_config'] = {
                "smtp_server": row['smtp_server'],
                "smtp_port": row['smtp_port'],
                "sender_email": row['sender_email']
            }
    
    # Fetch generic credentials
    cursor.execute("SELECT * FROM user_generic_credentials ORDER BY user_id, service_name")
    for cred in cursor.fetchall():
        uid = cred['user_id']
        if uid in users_map:
            users_map[uid]['credentials'].append({
                "id": cred['id'],
                "service_name": cred['service_name'],
                "credential_key": cred['credential_key'],
                "credential_value": cred['credential_value']
            })
    
    conn.close()
    return {"users": list(users_map.values())}

@app.get("/api/smtp-password/{username}")
async def get_smtp_password(username: str):
    """Returns SMTP password only on explicit request — never sent in the users list."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT c.sender_password
        FROM user_credentials c
        JOIN users u ON u.id = c.user_id
        WHERE u.username = ?
    """, (username,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="No credentials found")
    return {"password": row['sender_password']}

@app.delete("/api/users/{username}")
async def delete_user(username: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
    cursor.execute("DELETE FROM user_credentials WHERE user_id = ?", (user['id'],))
    cursor.execute("DELETE FROM user_generic_credentials WHERE user_id = ?", (user['id'],))
    cursor.execute("DELETE FROM scheduled_tasks WHERE user_id = ?", (user['id'],))
    cursor.execute("DELETE FROM users WHERE id = ?", (user['id'],))
    conn.commit()
    conn.close()
    return {"status": "success"}

class GenericCredentialRequest(BaseModel):
    username: str
    service_name: str
    credential_key: str
    credential_value: str

@app.post("/api/user/credentials")
async def add_generic_credential(req: GenericCredentialRequest):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE username = ?", (req.username,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
    cursor.execute("""
        INSERT INTO user_generic_credentials (user_id, service_name, credential_key, credential_value)
        VALUES (?, ?, ?, ?)
    """, (user['id'], req.service_name, req.credential_key, req.credential_value))
    conn.commit()
    conn.close()
    return {"status": "success"}

@app.delete("/api/user/credentials/{cred_id}")
async def delete_generic_credential(cred_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM user_generic_credentials WHERE id = ?", (cred_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}


# MCP configs — email always runs as stdio subprocess and fetches credentials from DB
# Scheduling is handled natively in agent.py (not as an MCP server)
mcp_configs = {
    "math": {
        "command": sys.executable,
        "args": [os.path.abspath(os.path.join(os.path.dirname(__file__), "math_server.py"))],
        "transport": "stdio",
    },
    "email": {
        "command": sys.executable,
        "args": [os.path.abspath(os.path.join(os.path.dirname(__file__), "email_server.py"))],
        "transport": "stdio",
    },
    "web_search": {
        "command": sys.executable,
        "args": [os.path.abspath(os.path.join(os.path.dirname(__file__), "tavily_server.py"))],
        "transport": "stdio",
    }
}

def get_mcp_configs(user_id: int = None):
    """Returns MCP configs, merging hardcoded ones with dynamically added ones from DB."""
    configs = mcp_configs.copy()
    
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM mcp_servers")
        for row in cursor.fetchall():
            conf = {"transport": row["transport"]}
            if row["transport"] == "stdio":
                conf["command"] = row["command"]
                if row["args"]: conf["args"] = json.loads(row["args"])
                if row["env"]: conf["env"] = json.loads(row["env"])
            elif row["transport"] == "sse":
                conf["url"] = row["url"]
                if row["headers"]: conf["headers"] = json.loads(row["headers"])
            configs[row["name"]] = conf
        conn.close()
    except Exception as e:
        print(f"Error loading MCP servers from DB: {e}")
        
    return configs

# --- API Endpoints ---
@app.get("/api/mcp/servers")
async def list_servers():
    return {"servers": get_mcp_configs()}

@app.post("/api/mcp/servers")
async def add_server(config: MCPServerConfig):
    configs = get_mcp_configs()
    if config.name in configs:
        raise HTTPException(status_code=400, detail="Server already exists")
    if config.transport not in {"stdio", "sse"}:
        raise HTTPException(status_code=400, detail="transport must be 'stdio' or 'sse'")
    
    new_config = {"transport": config.transport}
    
    command = None
    args_str = None
    env_str = None
    url = None
    headers_str = None

    if config.transport == "stdio":
        if not config.command:
            raise HTTPException(status_code=400, detail="command is required for stdio servers")
        new_config["command"] = config.command
        new_config["args"] = config.args
        command = config.command
        args_str = json.dumps(config.args) if config.args else None
        env_str = json.dumps(config.env) if config.env else None
    elif config.transport == "sse":
        if not config.url:
            raise HTTPException(status_code=400, detail="url is required for sse servers")
        new_config["url"] = config.url
        if config.headers:
            new_config["headers"] = config.headers
        url = config.url
        headers_str = json.dumps(config.headers) if config.headers else None

    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO mcp_servers (name, transport, command, args, env, url, headers)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (config.name, config.transport, command, args_str, env_str, url, headers_str))
        conn.commit()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save MCP server: {str(e)}")

    return {"status": "success", "config": new_config}

@app.delete("/api/mcp/servers/{name}")
async def remove_server(name: str):
    configs = get_mcp_configs()
    if name not in configs:
        raise HTTPException(status_code=404, detail="Server not found")
        
    if name in mcp_configs:
        raise HTTPException(status_code=400, detail="Cannot delete default server")

    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM mcp_servers WHERE name = ?", (name,))
        conn.commit()
        conn.close()
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete MCP server: {str(e)}")

@app.get("/")
async def health_check():
    return {"status": "ok", "message": "Agent Server Running"}

# --- CHAT HISTORY API ---
@app.get("/api/chats")
async def list_chats(username: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=401, detail="User not found")
        
    cursor.execute("SELECT thread_id, title, updated_at FROM chat_threads WHERE user_id = ? ORDER BY updated_at DESC", (user['id'],))
    threads = cursor.fetchall()
    conn.close()
    
    return {"threads": [{"thread_id": t["thread_id"], "title": t["title"], "updated_at": t["updated_at"]} for t in threads]}

@app.post("/api/chats")
async def create_chat(username: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=401, detail="User not found")
        
    import uuid
    thread_id = str(uuid.uuid4())
    title = f"New Chat"
    
    cursor.execute("INSERT INTO chat_threads (user_id, thread_id, title) VALUES (?, ?, ?)", (user['id'], thread_id, title))
    conn.commit()
    conn.close()
    
    return {"thread_id": thread_id, "title": title}

@app.delete("/api/chats/{thread_id}")
async def delete_chat(thread_id: str, username: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=401, detail="User not found")
        
    cursor.execute("DELETE FROM chat_threads WHERE thread_id = ? AND user_id = ?", (thread_id, user['id']))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

@app.get("/api/chats/{thread_id}/history")
async def get_chat_history(thread_id: str, username: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=401, detail="User not found")
        
    cursor.execute("SELECT 1 FROM chat_threads WHERE thread_id = ? AND user_id = ?", (thread_id, user['id']))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Thread not found")
    conn.close()

    try:
        # get_chat_history might be called before graph is ready if client connects instantly, but usually it's fine
        # We need to use aget_state because of AsyncSqliteSaver
        state = await graph.aget_state({"configurable": {"thread_id": thread_id}})
        messages = state.values.get("messages", [])
        
        formatted = []
        for m in messages:
            mtype = type(m).__name__
            if mtype == 'HumanMessage':
                formatted.append({"type": "user", "content": m.content})
            elif mtype == 'AIMessage':
                if hasattr(m, "tool_calls") and m.tool_calls:
                    for tc in m.tool_calls:
                        formatted.append({"type": "tool_use", "name": tc.get('name')})
                if hasattr(m, "content") and m.content:
                    # m.content can be a string or a list of dicts/strings (e.g. from Gemini)
                    content_val = ""
                    if isinstance(m.content, str):
                        content_val = m.content
                    elif isinstance(m.content, list):
                        for item in m.content:
                            if isinstance(item, dict) and "text" in item:
                                content_val += item["text"]
                            elif isinstance(item, str):
                                content_val += item
                            else:
                                content_val += str(item)
                    formatted.append({"type": "agent", "content": content_val})
            elif mtype == 'SystemMessage' and getattr(m, "content", "").startswith("[System]"):
                formatted.append({"type": "system", "content": m.content})

        return {"messages": formatted}
    except Exception as e:
        print("Error fetching history:", e)
        return {"messages": []}

# --- CHAT ENDPOINT ---
@app.post("/agent/stream")
async def chat_endpoint(request: ChatRequest):
    print(f"Received request: {request.message} (Thread: {request.thread_id}) for user: {request.username}")
    import time as _time
    req_start = _time.time()
    print(f"\n[{_time.strftime('%H:%M:%S')}] ▶ REQUEST  user={request.username} thread={request.thread_id}")
    print(f"[{_time.strftime('%H:%M:%S')}]   message='{request.message[:120]}'")

    # Get user_id for the given username
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE username = ?", (request.username,))
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
        
    user_id = user['id']
    dynamic_mcp_configs = get_mcp_configs(user_id)
    print(f"[{_time.strftime('%H:%M:%S')}]   mcp_servers={list(dynamic_mcp_configs.keys())}")
    
    # Update thread title and updated_at
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT title FROM chat_threads WHERE thread_id = ?", (request.thread_id,))
    thread_row = cursor.fetchone()
    if thread_row:
        if thread_row["title"] == "New Chat":
            words = request.message.split()[:4]
            new_title = " ".join(words) + ("..." if len(request.message.split()) > 4 else "")
            cursor.execute("UPDATE chat_threads SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE thread_id = ?", (new_title, request.thread_id))
        else:
            cursor.execute("UPDATE chat_threads SET updated_at = CURRENT_TIMESTAMP WHERE thread_id = ?", (request.thread_id,))
        conn.commit()
    conn.close()
    try:
        config = {
            "configurable": {
                "thread_id": request.thread_id,
                "preferred_model": request.preferred_model or "local",
                "username": request.username
            }
        }
        
        # 1. Deduplication Prep
        current_state = await graph.aget_state(config)
        seen_ids = set()
        if current_state and current_state.values and "messages" in current_state.values:
            for m in current_state.values["messages"]:
                if hasattr(m, "id") and m.id:
                    seen_ids.add(m.id)

        inputs = {
            "messages": [
                SystemMessage(content=f"SYSTEM_USERNAME:{request.username}"),
                ("user", request.message)
            ],
            "mcp_config": dynamic_mcp_configs 
        }
        
        async def event_generator():
            import time as _t
            print(f"[{_t.strftime('%H:%M:%S')}]   ⚙ graph.astream START")
            
            # Figure out which model is actually being used (respects preferred_model)
            preferred = request.preferred_model or "local"
            if preferred == "local":
                used_model = "Local Qwen3 4B"
            else:
                conn2 = get_db()
                cursor2 = conn2.cursor()
                cursor2.execute("SELECT c.credential_value FROM user_generic_credentials c JOIN users u ON c.user_id = u.id WHERE u.username = ? AND c.service_name = 'gemini' AND c.credential_key = 'api_key'", (request.username,))
                gemini_cred = cursor2.fetchone()
                conn2.close()
                used_model = "Gemini 3.1 Flash Lite" if (gemini_cred and gemini_cred['credential_value']) else "Local Qwen3 4B"
            
            yield json.dumps({"type": "model_info", "model": used_model}) + "\n"
            yield json.dumps({"type": "message", "content": ("_Thinking..._\n" if request.preferred_model == "cloud" else "_Thinking (Local)..._\n")}) + "\n"
            
            event_count = 0
            has_sent_real_message = False
            async for event in graph.astream(inputs, config=config, stream_mode="updates"):
                event_count += 1
                for node_name, node_value in event.items():
                    print(f"[{_t.strftime('%H:%M:%S')}]   ⚡ event#{event_count} node={node_name} keys={list(node_value.keys())}")
                    if "messages" in node_value:
                        messages = node_value["messages"]
                        if not isinstance(messages, list):
                            messages = [messages]
                            
                        for msg in messages:
                            # Deduplication
                            if hasattr(msg, "id") and msg.id and msg.id in seen_ids:
                                continue
                            if hasattr(msg, "id") and msg.id:
                                seen_ids.add(msg.id)

                            # --- FILTERING START ---
                            # Allow AI Messages AND System Messages (Errors)
                            if isinstance(msg, (AIMessage, SystemMessage)):
                                
                                # A. Detect Tool Calls
                                if hasattr(msg, "tool_calls") and msg.tool_calls:
                                    for tool_call in msg.tool_calls:
                                        tool_info = json.dumps({
                                            "type": "tool_use",
                                            "tool": tool_call.get("name", "Unknown Tool")
                                        })
                                        yield f"{tool_info}\n"                                 # B. Stream Content — skip raw tool-call JSON blobs
                                if hasattr(msg, "content") and msg.content:
                                    content_str = ""
                                    if isinstance(msg.content, str):
                                        content_str = msg.content
                                    elif isinstance(msg.content, list):
                                        for item in msg.content:
                                            if isinstance(item, dict) and "text" in item:
                                                content_str += item["text"]
                                            elif isinstance(item, str):
                                                content_str += item

                                    stripped = content_str.strip()
                                    # Drop messages whose content is just a raw JSON tool-call block
                                    # (Qwen3 sometimes echoes the tool call as text)
                                    is_raw_tool_json = False
                                    if stripped.startswith("{") and stripped.endswith("}"):
                                        try:
                                            parsed = json.loads(stripped)
                                            if any(k in parsed for k in ("name", "arguments", "tool", "function")):
                                                is_raw_tool_json = True
                                        except Exception:
                                            pass

                                    if stripped and not is_raw_tool_json:
                                        data = json.dumps({
                                            "type": "message",
                                            "content": content_str
                                        })
                                        yield f"{data}\n"
                            # --- FILTERING END ---
                            
            elapsed = round(_t.time() - req_start, 2)
            yield json.dumps({"type": "time_taken", "elapsed": elapsed}) + "\n"
            print(f"[{_t.strftime('%H:%M:%S')}]   ✅ graph.astream DONE — {event_count} events in {elapsed}s")

        from fastapi.responses import StreamingResponse
        return StreamingResponse(event_generator(), media_type="application/x-ndjson")

    except Exception as e:
        import traceback
        print(f"[ERROR] Server Error in /agent/stream: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

# --- BACKGROUND SCHEDULER (APScheduler) ---
async def execute_single_task(task):
    from langchain_core.messages import SystemMessage, HumanMessage
    import asyncio
    import json as _json

    user_info = None
    try:
        conn = get_db()
        cursor = conn.cursor()
        # Fetch user preference and gemini key
        cursor.execute("""
            SELECT u.preferred_model, c.credential_value as gemini_key
            FROM users u
            LEFT JOIN user_generic_credentials c ON c.user_id = u.id AND c.service_name = 'gemini' AND c.credential_key = 'api_key'
            WHERE u.username = ?
        """, (task['username'],))
        user_info = cursor.fetchone()
        conn.close()
    except Exception as e:
        logger.error(f"Error fetching user info for task: {e}")
        pass
        
    conn = get_db()
    cursor = conn.cursor()
    
    logger.info(f"Executing scheduled task ID: {task['id']} for user {task['username']}")
    print(f"Executing scheduled task ID: {task['id']} for user {task['username']}")
    
    try:
        # Use the pre-rephrased prompt if available, fallback to original
        present_tense_prompt = task.get('rephrased_prompt') or task['original_prompt']
        logger.info(f"Using prompt: {present_tense_prompt}")
        
        # 2. Execute autonomously with correct user context
        dynamic_mcp_configs = get_mcp_configs(task['user_id'])
        thread_id = f"scheduled_task_{task['id']}"
        
        # Determine model preference for the agent run
        pref = "local"
        if user_info and user_info['preferred_model'] == "cloud" and user_info['gemini_key']:
            pref = "cloud"
            
        logger.info(f"Task {task['id']}: Using model preference '{pref}' for execution")
        config = {"configurable": {"thread_id": thread_id, "preferred_model": pref}}

        # Append any stored metadata as extra context for the agent
        context_note = ""
        if task.get("task_metadata"):
            try:
                meta = _json.loads(task["task_metadata"])
                parts = []
                if meta.get("files"):
                    names = [f.get("name", f.get("path", "?")) for f in meta["files"]]
                    parts.append(f"Attached files: {', '.join(names)}")
                if meta.get("urls"):
                    parts.append(f"Reference URLs: {', '.join(meta['urls'])}")
                if meta.get("notes"):
                    parts.append(f"Notes: {meta['notes']}")
                if parts:
                    context_note = "\n\nContext:\n" + "\n".join(parts)
            except Exception:
                context_note = f"\n\nContext: {task['task_metadata']}"

        inputs = {
            "messages": [
                SystemMessage(content=f"SYSTEM_USERNAME:{task['username']}"),
                SystemMessage(content="IMPORTANT: You are running in BACKGROUND AUTONOMOUS MODE. Execute the user's request IMMEDIATELY using the available tools. Do NOT ask for permission, do NOT ask clarifying questions, and do NOT just say you will do it. Actually call the required tools now."),
                ("user", present_tense_prompt + context_note)
            ],
            "mcp_config": dynamic_mcp_configs
        }
        result_log = ""
        # Run the graph asynchronously in the async loop
        async for event in graph.astream(inputs, config=config, stream_mode="updates"):
            for node_name, node_value in event.items():
                if "messages" in node_value:
                    messages = node_value["messages"]
                    if not isinstance(messages, list):
                        messages = [messages]
                    for msg in messages:
                        mtype = type(msg).__name__
                        if mtype == 'AIMessage':
                            if hasattr(msg, "tool_calls") and msg.tool_calls:
                                names = [tc.get('name') for tc in msg.tool_calls]
                                result_log += f"Action: Calling tools {names}\n"
                            if hasattr(msg, "content") and msg.content:
                                result_log += f"Agent: {msg.content}\n"
                        elif mtype == 'ToolMessage':
                            result_log += f"Tool Result: {msg.content}\n"
                        elif mtype == 'SystemMessage' and "[System]" in msg.content:
                            result_log += f"System: {msg.content}\n"
        # Update status and check for recurrence
        cursor.execute("UPDATE scheduled_tasks SET status = 'completed', result_log = ? WHERE id = ?", (result_log, task['id']))
        
        recurrence = task.get('recurrence')
        if recurrence:
            from datetime import timedelta, datetime
            now = datetime.utcnow()
            next_time = None
            
            # Parse shorthand like 5m, 1h, 1d
            import re
            match = re.match(r'^(\d+)([mhd])$', recurrence)
            if match:
                val, unit = int(match.group(1)), match.group(2)
                if unit == 'm': next_time = now + timedelta(minutes=val)
                elif unit == 'h': next_time = now + timedelta(hours=val)
                elif unit == 'd': next_time = now + timedelta(days=val)
            else:
                # Fallback for old named intervals
                if recurrence == "hourly": next_time = now + timedelta(hours=1)
                elif recurrence == "daily": next_time = now + timedelta(days=1)
                elif recurrence == "weekly": next_time = now + timedelta(weeks=1)
                
            if next_time:
                # 5. Handle Run Limits: Check if there's a [Remaining runs: X] marker
                new_rephrased = task["rephrased_prompt"]
                new_original = task["original_prompt"]
                should_reschedule = True
                
                match_runs = re.search(r'\[Remaining runs: (\d+)\]', new_rephrased)
                if match_runs:
                    runs = int(match_runs.group(1)) - 1
                    if runs <= 0:
                        should_reschedule = False
                        logger.info(f"Task {task['id']} reached run limit. Stopping recurrence.")
                    else:
                        new_rephrased = re.sub(r'\[Remaining runs: \d+\]', f'[Remaining runs: {runs}]', new_rephrased)
                        new_original = re.sub(r'\[Remaining runs: \d+\]', f'[Remaining runs: {runs}]', new_original)

                if should_reschedule:
                    cursor.execute(
                        "INSERT INTO scheduled_tasks (user_id, original_prompt, rephrased_prompt, execution_time, status, task_metadata, recurrence) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
                        (task["user_id"], new_original, new_rephrased, next_time.strftime("%Y-%m-%d %H:%M:%S"), task.get("task_metadata"), recurrence),
                    )
                    logger.info(f"Scheduled next recurring run for task {task['id']} ({recurrence}) at {next_time}. Remaining: {runs if match_runs else 'inf'}")
    except Exception as ex:
        logger.error(f"Error executing background task {task['id']}: {ex}", exc_info=True)
        import traceback
        print(f"Task {task['id']} execution failed: {ex}")
        print(traceback.format_exc())
        cursor.execute("UPDATE scheduled_tasks SET status = 'failed', result_log = ? WHERE id = ?", (str(ex), task['id']))
    finally:
        conn.commit()
        conn.close()

async def poll_scheduled_tasks():
    try:
        conn = get_db()
        cursor = conn.cursor()
        # Fetch pending tasks where execution_time <= NOW
        cursor.execute('''
            SELECT t.*, u.username FROM scheduled_tasks t 
            JOIN users u ON t.user_id = u.id 
            WHERE t.status = 'pending' AND t.execution_time <= CURRENT_TIMESTAMP
        ''')
        due_tasks = [dict(row) for row in cursor.fetchall()]
        
        if due_tasks:
            logger.info(f"Polling: Found {len(due_tasks)} tasks ready for execution.")
            print(f"Polling: Found {len(due_tasks)} tasks ready for execution.")

        for task in due_tasks:
            logger.info(f"Picking up task {task['id']} (User: {task['username']}) - Execution time: {task['execution_time']}")
            print(f"Picking up task {task['id']} (User: {task['username']})")
            
            # Mark processing immediately to avoid double-pickup
            cursor.execute("UPDATE scheduled_tasks SET status = 'processing' WHERE id = ?", (task['id'],))
            conn.commit()
            
            import asyncio
            # Spawn task asynchronously so multiple tasks can run simultaneously!
            asyncio.create_task(execute_single_task(task))
            
        conn.close()
    except Exception as e:
        logger.error(f"APScheduler polling error: {e}", exc_info=True)
        print(f"APScheduler polling error: {e}")

# Lifespan and app moved to top

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
