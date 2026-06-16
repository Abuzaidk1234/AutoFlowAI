import db
db.init_db()

import sqlite3
conn = db.get_db()
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_threads';")
print('chat_threads exists:', cursor.fetchone() is not None)
conn.close()
