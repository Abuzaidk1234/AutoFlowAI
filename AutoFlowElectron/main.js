const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const ngrok = require('ngrok');
const fs = require('fs-extra');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { z } = require('zod');

// === CONFIGURATION ===
const PORT = 3005;
const ALLOWED_ROOT = path.join(__dirname, 'AutoFlowData');
fs.ensureDirSync(ALLOWED_ROOT);

let mainWindow;
let serverInstance = null; // Track server state

// === MCP SETUP (Same as before) ===
function createMcpServer() {
    const mcpServer = new McpServer({ name: "Electron Filesystem Node", version: "1.0.0" });

    function resolveAllowedPath(relativePath = '.') {
        const fullPath = path.resolve(ALLOWED_ROOT, relativePath || '.');
        const relative = path.relative(ALLOWED_ROOT, fullPath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
        return fullPath;
    }

    mcpServer.tool("list_directory", { path: z.string() }, async ({ path: relativePath }) => {
        const fullPath = resolveAllowedPath(relativePath);
        if (!fullPath) return { content: [{ type: "text", text: "Access Denied" }] };
        try {
            const files = await fs.readdir(fullPath);
            return { content: [{ type: "text", text: JSON.stringify(files, null, 2) }] };
        } catch (err) { return { isError: true, content: [{ type: "text", text: err.message }] }; }
    });

    mcpServer.tool("read_file", { path: z.string() }, async ({ path: relativePath }) => {
        const fullPath = resolveAllowedPath(relativePath);
        if (!fullPath) return { content: [{ type: "text", text: "Access Denied" }] };
        try {
            const content = await fs.readFile(fullPath, 'utf-8');
            return { content: [{ type: "text", text: content }] };
        } catch (err) { return { isError: true, content: [{ type: "text", text: err.message }] }; }
    });

    mcpServer.tool("write_file", { path: z.string(), content: z.string() }, async ({ path: relativePath, content }) => {
        const fullPath = resolveAllowedPath(relativePath);
        if (!fullPath) return { content: [{ type: "text", text: "Access Denied" }] };
        try {
            await fs.outputFile(fullPath, content);
            return { content: [{ type: "text", text: `Successfully wrote to ${relativePath}` }] };
        } catch (err) { return { isError: true, content: [{ type: "text", text: err.message }] }; }
    });
    
    return mcpServer;
}

// === EXPRESS & NGROK LOGIC ===
let currentMcpUrl = null;
async function startServerAndTunnel() {
  if (serverInstance) {
    if (currentMcpUrl) mainWindow.webContents.send('ngrok-url', currentMcpUrl);
    else mainWindow.webContents.send('mcp-error', "Ngrok failed previously");
    return; // Prevent double start
  }

  const webApp = express();
  const transports = new Map();

  webApp.use(cors());
  webApp.use(bodyParser.json());

  webApp.get('/sse', async (req, res) => {
    try {
        const transport = new SSEServerTransport('/message', res);
        const mcpServer = createMcpServer();
        await mcpServer.connect(transport);
        transports.set(transport.sessionId, transport);
        
        // Clean up when connection closes
        res.on('close', () => {
            transports.delete(transport.sessionId);
        });
    } catch (err) {
        console.error("SSE connect error:", err);
        if (!res.headersSent) {
            res.status(500).send(err.message);
        }
    }
  });

  webApp.post('/message', async (req, res) => {
    const sessionId = req.query.sessionId;
    const transport = transports.get(sessionId);
    if (transport) {
        await transport.handlePostMessage(req, res);
    } else {
        res.status(404).json({ error: "Transport not found for sessionId: " + sessionId });
    }
  });

  // 1. Start Local Server
  serverInstance = webApp.listen(PORT, async () => {
    console.log(`MCP Local Server running on port ${PORT}`);
    
    // Notify UI: Local Server Started (Still waiting for Ngrok)
    mainWindow.webContents.send('mcp-status', 'starting');

    try {
      // 2. Start Ngrok
      const url = await ngrok.connect(PORT);
      console.log(`Ngrok Tunnel Active: ${url}`);
      
      const fullMcpUrl = `${url}/sse`;
      
      // Notify UI: Ready
      currentMcpUrl = fullMcpUrl;
      mainWindow.webContents.send('ngrok-url', fullMcpUrl);
      
    } catch (err) {
      console.error("Ngrok Error:", err);
      currentMcpUrl = `http://localhost:${PORT}/sse`;
      mainWindow.webContents.send('ngrok-url', currentMcpUrl);
      mainWindow.webContents.send('mcp-error', err.message);
    }
  });
}

// === IPC LISTENERS ===
// Only start when renderer asks (after login)
ipcMain.on('start-mcp-server', () => {
    console.log("Received login signal. Starting MCP Server...");
    startServerAndTunnel();
});

ipcMain.handle('get-local-files', async () => {
    try {
        const files = await fs.readdir(ALLOWED_ROOT);
        const fileList = [];
        for (const file of files) {
            const stats = await fs.stat(path.join(ALLOWED_ROOT, file));
            if (stats.isFile()) {
                fileList.push({
                    name: file,
                    size: stats.size,
                    modified: stats.mtimeMs / 1000,
                    path: path.join(ALLOWED_ROOT, file)
                });
            }
        }
        return fileList;
    } catch (err) {
        return [];
    }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100, height: 700,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
