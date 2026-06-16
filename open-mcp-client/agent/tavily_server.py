import sys
import os
from mcp.server.fastmcp import FastMCP

# Initialize the MCP Server
mcp = FastMCP("tavily-search")

@mcp.tool()
def web_search(query: str) -> str:
    """
    Performs a web search to get up-to-date information.
    Use this for questions about current events, news, or specific data.
    """
    try:
        from ddgs import DDGS
        import io
        import contextlib
        import warnings
        warnings.filterwarnings("ignore")
        
        results = []
        
        # Suppress Python level outputs
        dummy = io.StringIO()
        with contextlib.redirect_stdout(dummy), contextlib.redirect_stderr(dummy):
            # Suppress OS level outputs (Rust binary logging to console)
            original_stdout_fd = 1
            original_stderr_fd = 2
            try:
                saved_stdout_fd = os.dup(original_stdout_fd)
                saved_stderr_fd = os.dup(original_stderr_fd)
                devnull = os.open(os.devnull, os.O_WRONLY)
                os.dup2(devnull, original_stdout_fd)
                os.dup2(devnull, original_stderr_fd)
                is_redirected = True
            except Exception:
                is_redirected = False
            
            try:
                with DDGS() as ddgs:
                    for result in ddgs.text(query, max_results=5):
                        title = result.get("title", "No Title")
                        url = result.get("href", "#")
                        content = result.get("body", "")[:200]
                        results.append(f"- [{title}]({url}): {content}...")
            finally:
                if is_redirected:
                    os.dup2(saved_stdout_fd, original_stdout_fd)
                    os.dup2(saved_stderr_fd, original_stderr_fd)
                    os.close(saved_stdout_fd)
                    os.close(saved_stderr_fd)
                    os.close(devnull)
            
        return "\n".join(results) if results else "No results found."

    except Exception as e:
        return f"Search failed: {str(e)}"

if __name__ == "__main__":
    mcp.run(transport="stdio")
