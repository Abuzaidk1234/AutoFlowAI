from mcp.server.fastmcp import FastMCP
import dateparser
import sqlite3
import os
import sys
from datetime import datetime

# Add the parent directory to sys.path to import db.py
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from db import get_db

mcp = FastMCP("Schedule")

# Note: schedule_task has been moved to agent.py as a native tool
# to improve reliability and reduce name collisions.

if __name__ == "__main__":
    mcp.run(transport="stdio")
