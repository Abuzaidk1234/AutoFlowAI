"""
Main Agent Entry Point
"""
from typing_extensions import Literal, TypedDict, Dict, List, Union, Optional
import logging

# Configure logging to file
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("autoflow.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("AutoFlowAI")

from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph, END, MessagesState

# Memory saver will be injected by server.py at startup
import pytz
from langgraph.types import Command
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent
from langchain_ollama import ChatOllama
from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI

# MCP Imports
from mcp.client.sse import sse_client
from mcp.client.session import ClientSession

import os
import sys
import json
import re
import copy
import dateparser
from datetime import datetime
from dotenv import load_dotenv

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

# DB access for native schedule tool
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import get_db

load_dotenv()

# --- Configuration Definitions ---
class StdioConnection(TypedDict):
    command: str
    args: List[str]
    transport: Literal["stdio"]
    env: Optional[Dict[str, str]]

class SSEConnection(TypedDict):
    url: str
    transport: Literal["sse"]
    headers: Optional[Dict[str, str]]

MCPConfig = Dict[str, Union[StdioConnection, SSEConnection]]

class AgentState(MessagesState):
    mcp_config: Optional[MCPConfig]

DEFAULT_MCP_CONFIG: MCPConfig = {
    "math": {
        "command": sys.executable,
        "args": [os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "math_server.py"))],
        "transport": "stdio",
    },
    "email": {
        "command": sys.executable,
        "args": [os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "email_server.py"))],
        "transport": "stdio",
    },
    "web_search": {
        "command": sys.executable,
        "args": [os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "tavily_server.py"))],
        "transport": "stdio",
    },
}

# ── Native Scheduling Tool (runs in-process, no MCP subprocess) ──────────────
@tool
def schedule_task(task_description: str, config: RunnableConfig, execution_time: str = "", recurrence: str = None, task_metadata: str = "", **kwargs) -> str:
    """
    Schedule a task to be executed at a specific future date and time, optionally recurring.
    Use this whenever the user asks to do something LATER or at a specific interval (e.g. daily, hourly).

    Args:
        task_description: Full standalone description of what needs to be done.
        execution_time: Natural language time for the FIRST run, e.g. "today at 5pm", "tomorrow 9am".
        config: System configuration (injected automatically).
        recurrence: Optional interval for repeating the task. 
                    Allowed values: "hourly", "daily", "weekly", or None for one-off.
        task_metadata: Optional JSON string with extra context.
    """
    username = config.get("configurable", {}).get("username", "admin")
    logger.info(f"Scheduling task for user '{username}': {task_description} at {execution_time}")
    
    from langchain_core.messages import HumanMessage
    
    # Standardize recurrence
    # Support shorthand: 5m, 10m, 1h, 1d, etc.
    r_val = recurrence.lower().strip() if recurrence else None
    
    if r_val:
        import re
        if not re.match(r'^\d+[mhd]$', r_val) and r_val not in ["hourly", "daily", "weekly"]:
            return f"Failed to schedule: '{recurrence}' is not a valid interval. Use shorthand like '5m', '1h', or '1d'."
        
        # Normalize common names to shorthand
        if r_val == "hourly": r_val = "1h"
        elif r_val == "daily": r_val = "1d"
        elif r_val == "weekly": r_val = "7d"

    # Fallback to catch LLM hallucinating argument names
    if not execution_time:
        execution_time = kwargs.get("time") or kwargs.get("when") or kwargs.get("date") or ""
        
    if not execution_time:
        return "Failed to schedule: You must specify an execution_time (e.g., 'in 5 minutes')."

    parsed_date = dateparser.parse(
        execution_time,
        settings={
            "PREFER_DATES_FROM": "future",
            "TIMEZONE": "Asia/Kolkata",
            "TO_TIMEZONE": "UTC",
            "RETURN_AS_TIMEZONE_AWARE": True,
        },
    )

    if not parsed_date:
        return f"Failed to schedule: could not understand the time '{execution_time}'."

    # Keep a copy in IST for the confirmation message
    display_date = parsed_date.astimezone(pytz.timezone("Asia/Kolkata"))
    
    # Convert to UTC for storage
    parsed_date_utc = parsed_date.astimezone(pytz.UTC).replace(tzinfo=None)

    from datetime import datetime, timezone
    if parsed_date <= datetime.now(timezone.utc):
        return f"Failed to schedule: first run '{execution_time}' is in the past."

    # --- IMMEDIATE REPHRASE ---
    rephrased_prompt = task_description
    try:
        preferred_model = config.get("configurable", {}).get("preferred_model", "local")
        rephrase_model = None
        
        if preferred_model == "cloud":
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT c.credential_value FROM user_generic_credentials c 
                JOIN users u ON c.user_id = u.id 
                WHERE u.username = ? AND c.service_name = 'gemini' AND c.credential_key = 'api_key'
            """, (username,))
            gemini_cred = cursor.fetchone()
            conn.close()
            if gemini_cred:
                from langchain_google_genai import ChatGoogleGenerativeAI
                rephrase_model = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite", google_api_key=gemini_cred['credential_value'])
        
        if rephrase_model is None:
            from langchain_ollama import ChatOllama
            rephrase_model = ChatOllama(model="qwen3:4b")
            
        system_rephrase = "You are an agent. Rephrase the following task into a direct, imperative command for another AI agent. Just the command."
        res = rephrase_model.invoke([HumanMessage(content=f"{system_rephrase}\n\nTask: {task_description}")])
        rephrased_prompt = res.content.strip()
    except Exception as e:
        logger.warning(f"Proactive rephrase failed: {e}")

    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
        user = cursor.fetchone()
        if not user:
            conn.close()
            print(f"DEBUG: Failed to schedule: user '{username}' not found.")
            return f"Failed to schedule: user '{username}' not found."
            
        cursor.execute(
            "INSERT INTO scheduled_tasks (user_id, original_prompt, rephrased_prompt, execution_time, status, task_metadata, recurrence) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
            (user["id"], task_description, rephrased_prompt, parsed_date_utc.strftime("%Y-%m-%d %H:%M:%S"), task_metadata, r_val),
        )
        conn.commit()
        conn.close()
        
        recur_note = f" (recurring {r_val})" if r_val else ""
        res = f"✅ Scheduled for {display_date.strftime('%I:%M %p')} IST{recur_note} — I'll run: \"{rephrased_prompt}\""
        print(f"DEBUG: schedule_task Success: {res}")
        return res
    except Exception as e:
        logger.error(f"Internal error in schedule_task: {e}")
        print(f"DEBUG: Internal error in schedule_task: {e}")
        return f"Error saving scheduled task: {e}"

@tool
def search_knowledge_base(query: str, config: RunnableConfig) -> str:
    """
    Search the organizational knowledge base (RAG) for information.
    Use this when the user asks questions about documents, company policies, or specific data not in your immediate context.
    """
    from rag_manager import rag_manager
    try:
        # Extract preferred_model from config
        preferred_model = config.get("configurable", {}).get("preferred_model", "cloud")
        results = rag_manager.query(query, preferred_model=preferred_model)
        if not results:
            return "No relevant information found in the knowledge base."
        
        formatted = "\n---\n".join([f"Source: {r.metadata.get('filename','unknown')}\nContent: {r.page_content}" for r in results])
        return f"Found the following relevant information:\n{formatted}"
    except Exception as e:
        return f"Error searching knowledge base: {e}"

AUTOFLOW_DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "AutoFlowElectron", "AutoFlowData"))

def _resolve_allowed_path(relative_path: str) -> str:
    if not relative_path:
        relative_path = "."
    # If the LLM explicitly passes "AutoFlowData" as the path, treat it as root
    if relative_path == "AutoFlowData" or relative_path.startswith("AutoFlowData/") or relative_path.startswith("AutoFlowData\\"):
        relative_path = relative_path.replace("AutoFlowData", ".", 1)
        
    path_obj = os.path.abspath(os.path.join(AUTOFLOW_DATA_DIR, relative_path))
    if not path_obj.startswith(AUTOFLOW_DATA_DIR):
        raise ValueError(f"Access Denied: Cannot access paths outside AutoFlowData ({path_obj})")
    return path_obj

@tool
def list_local_directory(path: str = ".") -> str:
    """Lists files and folders in the local AutoFlowData directory."""
    try:
        full_path = _resolve_allowed_path(path)
        if not os.path.exists(full_path):
            return f"Directory {path} does not exist."
        items = os.listdir(full_path)
        return json.dumps(items, indent=2)
    except Exception as e:
        return f"Error listing directory: {str(e)}"

@tool
def read_local_file(path: str) -> str:
    """Reads a file from the local AutoFlowData directory."""
    try:
        full_path = _resolve_allowed_path(path)
        if not os.path.exists(full_path):
            return f"File {path} does not exist."
        with open(full_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        return f"Error reading file: {str(e)}"

@tool
def write_local_file(path: str, content: str) -> str:
    """Writes to a file in the local AutoFlowData directory. Creates directories if needed."""
    try:
        full_path = _resolve_allowed_path(path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(content)
        return f"Successfully wrote to {path}"
    except Exception as e:
        return f"Error writing file: {str(e)}"

@tool
def delete_local_file(path: str) -> str:
    """Deletes a file in the local AutoFlowData directory."""
    try:
        full_path = _resolve_allowed_path(path)
        if not os.path.exists(full_path):
            return f"File {path} does not exist."
        os.remove(full_path)
        return f"Successfully deleted {path}"
    except Exception as e:
        return f"Error deleting file: {str(e)}"

NATIVE_TOOLS = [schedule_task, search_knowledge_base, list_local_directory, read_local_file, write_local_file, delete_local_file]

def _friendly_runtime_error(error: BaseException, preferred_model: str) -> str:
    message = str(error)
    lowered = message.lower()
    if (
        "ollama" in lowered
        or "qwen3" in lowered
        or "connection refused" in lowered
        or "connecterror" in lowered
        or "not found (status code: 404)" in lowered
    ):
        return (
            "Local model is unavailable. Start Ollama and run `ollama pull qwen3:4b`, "
            "or switch to Cloud mode and save a Gemini API key in Settings."
        )
    elif "API_KEY_INVALID" in lowered or "api key not valid" in lowered or "400" in lowered or "unauthorized" in lowered or "404" in lowered:
        return (
            "Cloud model credentials or Model Name are invalid. Add a Gemini API key in Settings, "
            "or switch to Local mode with Ollama qwen3:4b running.\n\n**Raw Error from Google:** " + message
        )
    if "tavily" in lowered:
        return "TAVILY_API_KEY is not configured. Add it to agent/.env before using web_search."
    return f"Technical error: {message}"

# --- CUSTOM CLIENT FIX ---
class FixedMCPClient(MultiServerMCPClient):
    """
    Custom client to fix compatibility issues with LangChain and Composio.
    Handles 'tuple' errors and 'header' support manually.
    """
    async def connect_to_server_via_sse(
        self, server_name: str, *, url: str, headers: Optional[Dict[str, str]] = None, **kwargs
    ):
        try:
            # 1. Connect to SSE (Returns a tuple of streams: read, write)
            streams = await self.exit_stack.enter_async_context(
                sse_client(url, headers=headers, timeout=60.0, **kwargs)
            )
            
            # 2. Wrap the streams in a ClientSession object
            # This prevents the "'tuple' object has no attribute 'initialize'" error
            session = await self.exit_stack.enter_async_context(
                ClientSession(streams[0], streams[1])
            )
            
            # 3. Pass the valid session object to the library
            await self._initialize_session_and_load_tools(server_name, session)
            
        except Exception as e:
            # Log failure but re-raise so the agent knows to fallback
            print(f"❌ Failed to connect to {server_name}: {e}")
            raise e
# --- Main Logic ---
async def chat_node(state: AgentState, config: RunnableConfig) -> Command[Literal["__end__"]]:
    mcp_config = state.get("mcp_config", DEFAULT_MCP_CONFIG)
    existing_ids = set(msg.id for msg in state["messages"] if hasattr(msg, "id") and msg.id)

    # ── 1. Extract current username from the sentinel SystemMessage ──────────
    current_username = "admin"
    for msg in state["messages"]:
        if isinstance(msg, SystemMessage) and msg.content.startswith("SYSTEM_USERNAME:"):
            current_username = msg.content.split(":", 1)[1].strip()
            break

    # ── 1.5 Setup Model ──────────────────────────────────────────────────────────
    preferred_model = config.get("configurable", {}).get("preferred_model", "cloud")
    ollama_model = ChatOllama(model="qwen3:4b")
    model = None

    try:
        if preferred_model == "local":
            raise ValueError("Local preference set")

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT c.credential_value FROM user_generic_credentials c 
            JOIN users u ON c.user_id = u.id 
            WHERE u.username = ? AND c.service_name = 'gemini' AND c.credential_key = 'api_key'
        """, (current_username,))
        gemini_cred = cursor.fetchone()
        conn.close()
        
        if gemini_cred and gemini_cred['credential_value']:
            model = ChatGoogleGenerativeAI(
                model="gemini-3.1-flash-lite", 
                google_api_key=gemini_cred['credential_value'],
                max_retries=0
            )
            print(f"Using gemini-3.1-flash-lite for {current_username}")
    except Exception as e:
        print(f"Error loading Gemini model: {e}")
        
    if model is None:
        model = ollama_model
        print(f"Using Local Qwen3:4b for {current_username}")

    # ── 2. Build rich system prompt ──────────────────────────────────────────
    ist = pytz.timezone("Asia/Kolkata")
    now_str = datetime.now(ist).strftime("%A, %d %B %Y %I:%M %p IST")

    system_prompt = f"""You are AutoFlowAI, a high-performance executive assistant.
Current User: {current_username}
Current Time: {now_str}

### COMMUNICATION STYLE:
- **RESPONSE**: Be extremely brief, conversational, and professional. Provide the answer directly without over-explaining your internal reasoning.

### STRICT OPERATIONAL WORKFLOW:
1. **DISCOVERY FIRST**: If a task involves a file, you MUST call `search_knowledge_base` or `list_dir` FIRST.
2. **VALIDATION**: If the file is "Not Found", STOP and inform the user.
3. **ATOMIC ACTIONS**: Sending an email with an attachment is an ATOMIC operation. If the file is missing, DO NOT send the email.
4. **USER CONTEXT**: When calling `send_email`, always include `username="{current_username}"` so user-specific SMTP credentials are used.

### ADVANCED SCHEDULING:
- Intervals: Use shorthand like "5m", "1h", "1d".
- Durations: If the user specified a time limit (e.g., "for 1 hour"), calculate the total runs and include `[Remaining runs: X]` in the task description.
"""

    import time as _t

    clean_messages = [
        msg for msg in state["messages"]
        if not (isinstance(msg, SystemMessage) and msg.content.startswith("SYSTEM_USERNAME:"))
    ]

    active_mcp_config = copy.deepcopy(mcp_config)
    if "email" in active_mcp_config and active_mcp_config["email"].get("transport") == "stdio":
        active_mcp_config["email"]["env"] = {**os.environ, "AUTOFLOW_USERNAME": current_username}
    
    try:
        async with FixedMCPClient(active_mcp_config) as mcp_client:
            mcp_tools = mcp_client.get_tools()
            active_tools = mcp_tools + NATIVE_TOOLS
            
            react_agent = create_react_agent(model, active_tools, prompt=system_prompt)
            t1 = _t.time()
            initial_result = await react_agent.ainvoke({"messages": clean_messages})
            last_msg = initial_result["messages"][-1]
            
            # --- AGGRESSIVE JSON INTERCEPTION (Now for all models) ---
            if hasattr(last_msg, "content") and last_msg.content:
                # A. Normalize content to string
                raw_content = ""
                if isinstance(last_msg.content, str):
                    raw_content = last_msg.content
                elif isinstance(last_msg.content, list):
                    for item in last_msg.content:
                        if isinstance(item, dict) and "text" in item:
                            raw_content += item["text"]
                        elif isinstance(item, str):
                            raw_content += item
                
                if not raw_content:
                    result = initial_result
                else:
                    # B. Clean content for parsing (remove thought blocks which often contain braces)
                    clean_content = re.sub(r'<thought>.*?</thought>', '', raw_content, flags=re.DOTALL).strip()
                
                    try:
                        # B. Find all JSON-like blocks {...}
                        # Simple approach: find all sequences starting with { and ending with }
                        # We'll try the largest possible block first (fallback) and then smaller ones
                        json_blocks = []
                        
                        # Try to find all { ... } blocks. Note: greedy vs non-greedy choice.
                        # We'll use a non-greedy search for multiple blocks.
                        for match in re.finditer(r'\{.*?\}', clean_content, re.DOTALL):
                            json_blocks.append(match.group())
                        
                        # If we found nothing or the model output one big block
                        if not json_blocks:
                            # Extract everything between the first { and last }
                            s = clean_content.find('{')
                            e = clean_content.rfind('}')
                            if s != -1 and e != -1:
                                json_blocks = [clean_content[s:e+1]]

                        intercepted_msg = None
                        for json_str in json_blocks:
                            try:
                                # Clean up common LLM artifacts
                                json_str_fixed = json_str.replace('\'', '"') 
                                parsed = json.loads(json_str_fixed)
                                
                                tool_name = parsed.get("name") or parsed.get("task") or parsed.get("tool") or parsed.get("function") or parsed.get("call")
                                if not tool_name:
                                    if any(k in parsed for k in ("task_description", "execution_time", "time", "prompt")):
                                        tool_name = "schedule_task"
                                    elif any(k in parsed for k in ("to_email", "recipient", "body", "subject")):
                                        tool_name = "send_email"
                                
                                if tool_name:
                                    logger.info(f"🛠 Intercepted intent for '{tool_name}'")
                                    args = parsed.get("args") or parsed.get("arguments") or parsed.get("parameters") or parsed
                                    
                                    # Normalize args
                                    if tool_name == "schedule_task":
                                        if ("recipient" in args or "body" in args) and "task_description" not in args:
                                            args["task_description"] = f"Send email to {args.get('recipient','')} with body: {args.get('body','')}"
                                        if "interval" in args and "recurrence" not in args:
                                            args["recurrence"] = args["interval"]
                                        if "runs" in args and "[Remaining runs:" not in str(args.get("task_description","")):
                                            args["task_description"] = str(args.get("task_description","")) + f" [Remaining runs: {args['runs']}]"
                                        if "time" in args and "execution_time" not in args:
                                            args["execution_time"] = args["time"]
                                        if "prompt" in args and "task_description" not in args:
                                            args["task_description"] = args["prompt"]

                                    if not isinstance(args, dict): args = {"input": str(args)}

                                    intercepted_msg = AIMessage(
                                        content="",
                                        tool_calls=[{
                                            "name": tool_name,
                                            "args": {k: v for k, v in args.items() if k not in ["task", "name", "tool", "interval", "runs", "function", "call", "parameters"]},
                                            "id": f"call_{int(_t.time())}",
                                            "type": "tool_call"
                                        }],
                                        id=last_msg.id
                                    )
                                    
                                    # Clean the original message to remove the JSON block (improve UI)
                                    last_msg.content = last_msg.content.replace(json_str, "").replace("```json", "").replace("```", "").strip()
                                    break # Stop after first valid tool call found
                            except Exception:
                                continue

                        if intercepted_msg:
                            logger.info(f"Re-invoking agent with intercepted tool call")
                            result = await react_agent.ainvoke({"messages": clean_messages + [intercepted_msg]})
                        else:
                            result = initial_result

                    except Exception as ex:
                        logger.warning(f"Interception logic failed: {ex}")
                        result = initial_result
            else:
                result = initial_result

            all_output_messages = result.get("messages", [])
            print(f"  [{datetime.now().strftime('%H:%M:%S')}] LLM done in {round(_t.time()-t1,2)}s")

    except Exception as e:
        print(f"Agent runtime error: {e}")
        # Try a quick fallback response using the local model ONLY if local was preferred
        # Or if the user doesn't mind waiting. But for cloud, it's better to show the error instantly!
        friendly_msg = _friendly_runtime_error(e, preferred_model)
        
        if preferred_model == "cloud":
            # Just append the error instead of falling back to Qwen
            all_output_messages = clean_messages + [
                SystemMessage(content=f"[System] **Cloud API Error:**\n\n{friendly_msg}\n\n*Note: If you recently changed your Gemini model or API key, please ensure they are valid in Settings.*")
            ]
        else:
            friendly_error = SystemMessage(content=f"[System] {friendly_msg}")
            try:
                fallback_agent = create_react_agent(ollama_model, NATIVE_TOOLS, prompt=system_prompt)
                result = await fallback_agent.ainvoke({"messages": clean_messages + [friendly_error]})
                all_output_messages = result.get("messages", [])
            except Exception as fallback_error:
                all_output_messages = clean_messages + [
                    friendly_error,
                    SystemMessage(content=f"[System] {_friendly_runtime_error(fallback_error, preferred_model)}")
                ]

    # --- Post-Process: Clean Thinking ---
    for msg in all_output_messages:
        if hasattr(msg, 'content') and msg.content and isinstance(msg.content, str):
            msg.content = re.sub(r'<thought>.*?</thought>', '', msg.content, flags=re.DOTALL)
            msg.content = re.sub(r'\\boxed\{.*?\}', '', msg.content, flags=re.DOTALL).strip()

    new_messages = []
    for msg in all_output_messages:
        msg_id = getattr(msg, "id", None)
        if not msg_id or msg_id not in existing_ids:
            new_messages.append(msg)

    return Command(goto=END, update={"messages": new_messages})

workflow = StateGraph(AgentState)
workflow.add_node("chat_node", chat_node)
workflow.set_entry_point("chat_node")
# graph is now compiled in server.py
