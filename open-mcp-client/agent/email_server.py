import smtplib
import time
import re
import os
import sys

from email.message import EmailMessage
from mcp.server.fastmcp import FastMCP
from dotenv import load_dotenv

load_dotenv()

# Add the agent directory to path so we can import db.py
sys.path.insert(0, os.path.dirname(__file__))
from db import get_db

import logging
# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("email_server")

mcp = FastMCP("Email")

# Track recent emails to prevent duplicate sends within 60s
_recent_emails = {}


def _get_user_email_config(username: str):
    """
    Fetch SMTP credentials for a given username from the database.
    Falls back to environment variables if no DB entry is found.
    """
    if username == "admin" and os.environ.get("AUTOFLOW_USERNAME"):
        username = os.environ["AUTOFLOW_USERNAME"]

    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT c.smtp_server, c.smtp_port, c.sender_email, c.sender_password
            FROM user_credentials c
            JOIN users u ON u.id = c.user_id
            WHERE u.username = ?
        """, (username,))
        row = cursor.fetchone()
        conn.close()
        if row:
            return {
                "smtp_server": row['smtp_server'],
                "smtp_port": int(row['smtp_port']),
                "sender_email": row['sender_email'],
                "sender_password": row['sender_password'],
            }
    except Exception as e:
        print(f"[email_server] DB lookup failed: {e}", flush=True)

    # Fallback to environment variables / .env
    from dotenv import load_dotenv
    load_dotenv()
    return {
        "smtp_server": os.environ.get("SMTP_SERVER", "smtp.gmail.com"),
        "smtp_port": int(os.environ.get("SMTP_PORT", 587)),
        "sender_email": os.environ.get("SENDER_EMAIL", ""),
        "sender_password": os.environ.get("SENDER_PASSWORD", ""),
    }


@mcp.tool()
def send_email(to_email: str, subject: str, body: str, attachments: list[str] = None, username: str = "admin") -> str:
    """
    Send an email on behalf of a user, optionally with attachments.
    The tool automatically fetches the user's SMTP credentials from the database.

    Args:
        to_email: The recipient email address.
        subject: The email subject line.
        body: The email body content.
        attachments: Optional list of filenames or absolute paths. You can just pass the filename (e.g., ["Onboarding_Guide.md", "hello.txt"]) and the server will automatically find them in the organizational knowledge base or local directory. Do NOT fail if you can't find the absolute path yourself.
        username: The AutoFlowAI username (used to look up stored credentials).
    """
    global _recent_emails
    try:
        # Basic email validation
        if not re.match(r"[^@]+@[^@]+\.[^@]+", to_email):
            return f"Failed to send email: '{to_email}' is not a valid email address."

        # Deduplication: prevent exact same email within 60 seconds
        current_time = time.time()
        email_hash = f"{username}-{to_email}-{subject}-{body}-{str(attachments)}"
        _recent_emails = {k: v for k, v in _recent_emails.items() if current_time - v < 60}

        if email_hash in _recent_emails:
            return f"Successfully sent email to {to_email} with subject '{subject}' (Deduplicated)"

        _recent_emails[email_hash] = current_time

        # Look up credentials for this user
        config = _get_user_email_config(username)

        if not config['sender_email'] or not config['sender_password']:
            del _recent_emails[email_hash]
            return (
                f"Failed to send email: No email credentials found for user '{username}'. "
                "Configure SMTP credentials in the Settings tab or set SENDER_EMAIL and SENDER_PASSWORD in agent/.env."
            )

        msg = EmailMessage()
        msg.set_content(body)
        msg['Subject'] = subject
        msg['From'] = config['sender_email']
        msg['To'] = to_email

        # Handle Attachments
        if attachments:
            import mimetypes
            base_allowed_path_org = os.path.abspath(os.path.join(os.path.dirname(__file__), "org_filesystem"))
            base_allowed_path_local = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "AutoFlowElectron", "AutoFlowData"))
            failed_attachments = []
            attached_count = 0
            
            for file_path in attachments:
                # 1. Try absolute path first
                abs_path = os.path.abspath(file_path)
                
                # 2. Try to find it in org_filesystem or local AutoFlowData
                if not os.path.exists(abs_path):
                    alt_path_org = os.path.abspath(os.path.join(base_allowed_path_org, os.path.basename(file_path)))
                    alt_path_local = os.path.abspath(os.path.join(base_allowed_path_local, os.path.basename(file_path)))
                    if os.path.exists(alt_path_org):
                        abs_path = alt_path_org
                    elif os.path.exists(alt_path_local):
                        abs_path = alt_path_local

                # 3. Security Check
                norm_abs = os.path.normcase(abs_path)
                norm_org = os.path.normcase(base_allowed_path_org)
                norm_local = os.path.normcase(base_allowed_path_local)
                if not (norm_abs.startswith(norm_org) or norm_abs.startswith(norm_local)):
                    logger.warning(f"Security Block: {file_path} is outside the allowed directories.")
                    failed_attachments.append(f"{os.path.basename(file_path)} (Blocked)")
                    continue

                if not os.path.exists(abs_path):
                    logger.warning(f"Attachment not found: {abs_path}")
                    failed_attachments.append(f"{os.path.basename(file_path)} (Not Found)")
                    continue
                
                ctype, encoding = mimetypes.guess_type(abs_path)
                if ctype is None or encoding is not None:
                    ctype = 'application/octet-stream'
                maintype, subtype = ctype.split('/', 1)
                
                with open(abs_path, 'rb') as f:
                    file_data = f.read()
                    msg.add_attachment(
                        file_data,
                        maintype=maintype,
                        subtype=subtype,
                        filename=os.path.basename(abs_path)
                    )
                    attached_count += 1
            
            if failed_attachments:
                logger.warning(f"Some attachments failed: {failed_attachments}")
                del _recent_emails[email_hash]
                return (
                    "Failed to send email: could not attach "
                    f"{', '.join(failed_attachments)}. No email was sent."
                )

        with smtplib.SMTP(config['smtp_server'], config['smtp_port']) as server:
            server.starttls()
            server.login(config['sender_email'], config['sender_password'])
            server.send_message(msg)

        status_msg = f"Successfully sent email to {to_email}"
        if attachments:
            status_msg += f" with {attached_count} attachment(s)"
            if failed_attachments:
                status_msg += f". Warning: Failed to attach: {', '.join(failed_attachments)}"
        
        return status_msg

    except Exception as e:
        return f"Failed to send email: {str(e)}"


if __name__ == "__main__":
    mcp.run(transport="stdio")
