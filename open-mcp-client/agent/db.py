import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "autoflow.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Users Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    
    # User Email Credentials Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS user_credentials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        smtp_server TEXT NOT NULL,
        smtp_port INTEGER NOT NULL,
        sender_email TEXT NOT NULL,
        sender_password TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    ''')
    
    # Generic / Custom Credentials Table (for any MCP service)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS user_generic_credentials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        service_name TEXT NOT NULL,
        credential_key TEXT NOT NULL,
        credential_value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    ''')
    
    # Scheduled Tasks Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        original_prompt TEXT NOT NULL,
        execution_time DATETIME NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        result_log TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    ''')
    # MCP Servers Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS mcp_servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        transport TEXT NOT NULL,
        command TEXT,
        args TEXT,
        env TEXT,
        url TEXT,
        headers TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # Chat Threads Table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS chat_threads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        thread_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    ''')

    # Migrate: add created_at to users if it doesn't exist
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP")
    except Exception:
        pass  # Column already exists

    # Migrate: add task_metadata column to scheduled_tasks
    try:
        cursor.execute("ALTER TABLE scheduled_tasks ADD COLUMN task_metadata TEXT DEFAULT NULL")
    except Exception:
        pass

    # Migrate: add preferred_model to users
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN preferred_model TEXT DEFAULT 'local'")
    except Exception:
        pass

    # Migrate: add rephrased_prompt column to scheduled_tasks
    try:
        cursor.execute("ALTER TABLE scheduled_tasks ADD COLUMN rephrased_prompt TEXT DEFAULT NULL")
    except Exception:
        pass

    # Migrate: add recurrence column to scheduled_tasks
    try:
        cursor.execute("ALTER TABLE scheduled_tasks ADD COLUMN recurrence TEXT DEFAULT NULL")
    except Exception:
        pass

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")
