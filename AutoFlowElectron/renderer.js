const { ipcRenderer } = require('electron');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
// ==================== State ====================
let threadId = null;
let currentUsername = null;
let notifiedTaskIds = new Set(); // Track tasks already notified in this session
let modelPreference = "local"; // Default: local

// ==================== DOM Elements ====================
const loginContainer = document.getElementById("login-container");
const chatContainer = document.getElementById("chat-container");
const loginButton = document.getElementById("login-button");
const registerButton = document.getElementById("register-button");
const errorMessage = document.getElementById("error-message");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");

// Settings Elements
const backendUrlInput = document.getElementById("backend-url");
const backendStatus = document.getElementById("backend-status");
const testBackendBtn = document.getElementById("test-backend-btn");
const settingSmtpServer = document.getElementById("setting-smtp-server");
const settingSmtpPort = document.getElementById("setting-smtp-port");
const settingSenderEmail = document.getElementById("setting-sender-email");
const settingSenderPassword = document.getElementById("setting-sender-password");
const saveEmailBtn = document.getElementById("save-email-btn");
const togglePasswordVisibilityBtn = document.getElementById("toggle-password-visibility");
const eyeIconShow = document.getElementById("eye-icon-show");
const eyeIconHide = document.getElementById("eye-icon-hide");

if (togglePasswordVisibilityBtn) {
    togglePasswordVisibilityBtn.addEventListener("click", () => {
        const isHidden = settingSenderPassword.type === "password";
        settingSenderPassword.type = isHidden ? "text" : "password";
        eyeIconShow.style.display = isHidden ? "none" : "";
        eyeIconHide.style.display = isHidden ? "" : "none";
    });
}

const toggleGeminiVisibilityBtn = document.getElementById("toggle-gemini-visibility");
const geminiEyeIconShow = document.getElementById("gemini-eye-icon-show");
const geminiEyeIconHide = document.getElementById("gemini-eye-icon-hide");

if (toggleGeminiVisibilityBtn) {
    toggleGeminiVisibilityBtn.addEventListener("click", () => {
        const isHidden = settingGeminiKey.type === "password";
        settingGeminiKey.type = isHidden ? "text" : "password";
        geminiEyeIconShow.style.display = isHidden ? "none" : "";
        geminiEyeIconHide.style.display = isHidden ? "" : "none";
    });
}

// MCP Elements
const mcpUrlInput = document.getElementById("mcp-url");
const mcpStatus = document.getElementById("mcp-status");
const copyMcpBtn = document.getElementById("copy-mcp-btn");
const testMcpBtn = document.getElementById("test-mcp-btn");

const themeSwitch = document.getElementById("theme-switch");
const themeIcon = document.getElementById("theme-icon");
const displayUsername = document.getElementById("display-username");
const statOrgCount = document.getElementById("stat-org-count");
const statLocalCount = document.getElementById("stat-local-count");

// Chat Elements
const messagesContainer = document.getElementById("messages");
const emptyState = document.getElementById("empty-state");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const sidebarContainer = document.querySelector('.sidebar');

// Chat History Elements
const newChatBtn = document.getElementById("new-chat-btn");
const chatHistoryList = document.getElementById("chat-history-list");
const logoutBtn = document.getElementById("logout-btn");

if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem('autoflow_user');
        localStorage.removeItem('autoflow_pass');
        window.location.reload();
    });
}

// Tasks Elements
const tasksList = document.getElementById("tasks-list");
const refreshTasksBtn = document.getElementById("refresh-tasks-btn");

// Knowledge Elements
const orgFilesList = document.getElementById("org-files-list");
const localFilesList = document.getElementById("local-files-list");
const refreshLocalFilesBtn = document.getElementById("refresh-local-files");

// ==================== Utilities ====================
function getTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Always returns just origin (protocol + host), stripping any path
function getBaseUrl() {
  const raw = backendUrlInput.value.trim() || "http://localhost:8000";
  try {
    return new URL(raw).origin;
  } catch(e) {
    return "http://localhost:8000";
  }
}

function showToast(title, description, variant = "default") {
  const container = document.getElementById("toast-container");
  if (!container) return; 
  
  const toast = document.createElement("div");
  toast.className = `toast ${variant}`;
  toast.innerHTML = `
    <div class="toast-title">${title}</div>
    <div class="toast-description">${description}</div>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideOut 0.3s ease-out forwards";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==================== Tabs Logic ====================
const navTabs = document.querySelectorAll('.nav-tab');
const tabContents = document.querySelectorAll('.tab-content');

navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        navTabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        const targetContent = document.getElementById(`tab-${tab.dataset.tab}`);
        if (targetContent) {
            targetContent.classList.add('active');
        }
        
        if (tab.dataset.tab === 'tasks') {
            refreshTasks();
        }
        if (tab.dataset.tab === 'knowledge') {
            fetchOrgFilesForApp();
            syncLocalFilesWithBackend();
        }
    });
});

// ==================== Auth & Login Logic ====================
document.addEventListener("DOMContentLoaded", async () => {
    const savedUser = localStorage.getItem('autoflow_user');
    const savedPass = localStorage.getItem('autoflow_pass');
    const savedUrl = localStorage.getItem('autoflow_url');
    
    if (savedUrl) backendUrlInput.value = savedUrl;
    
    if (savedUser && savedPass) {
        usernameInput.value = savedUser;
        passwordInput.value = savedPass;
        await handleAuth(false);
    }
});
async function handleAuth(isRegister) {
  const user = usernameInput.value.trim();
  const pass = passwordInput.value.trim();
  let backendUrl = backendUrlInput.value.trim();

  if (!user || !pass) {
    errorMessage.textContent = "Please enter both username and password";
    return;
  }
  
  if (!backendUrl) {
    errorMessage.textContent = "Backend URL is missing in Settings";
    return;
  }

  // Always extract just the base URL (protocol + host) to strip any saved paths like /agent/stream
  try {
      backendUrl = new URL(backendUrl).origin;
  } catch(e) {
      errorMessage.textContent = "Invalid Backend URL in Settings. Example: http://localhost:8000";
      return;
  }

  try {
      errorMessage.textContent = "Connecting...";
      const endpoint = isRegister ? "/auth/register" : "/auth/login";
      const response = await fetch(`${backendUrl}${endpoint}`, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({username: user, password: pass})
      });
      
      const data = await response.json();
      
      if (!response.ok) {
          throw new Error(data.detail || "Authentication failed");
      }
      
      if (isRegister) {
          showToast("Success", "Account created successfully! Logging you in...");
          errorMessage.textContent = "";
      }
      
      // Successful Login
      localStorage.setItem('autoflow_user', user);
      localStorage.setItem('autoflow_pass', pass);
      if (backendUrlInput.value.trim()) localStorage.setItem('autoflow_url', backendUrlInput.value.trim());
      currentUsername = user;
      
      // Initialize task poller (mark existing tasks as notified to avoid spamming old alerts)
      notifiedTaskIds.clear();
      pollTaskNotifications(true); 
      displayUsername.textContent = user;
      errorMessage.textContent = "";

      loginContainer.classList.add("hidden");
      chatContainer.classList.remove("hidden");
      
      await loadChatHistory();

      mcpStatus.className = "status-dot status-warning";
      mcpStatus.title = "Starting MCP Node...";
      mcpUrlInput.value = "Starting Tunnel...";
      
      ipcRenderer.send('start-mcp-server');

      testBackendConnection();
      refreshServerSidebar();

      showToast("Welcome", `Logged in as ${user}`);
      loadEmailCredentials();
      loadModelPreference(); // Fetch from backend on login
      syncLocalFilesWithBackend();
  } catch (error) {
      errorMessage.textContent = error.message;
  }
}

async function loadChatHistory() {
    if (!chatHistoryList) return;
    try {
        const res = await fetch(`${getBaseUrl()}/api/chats?username=${currentUsername}`);
        const data = await res.json();
        chatHistoryList.innerHTML = "";
        
        if (data.threads && data.threads.length > 0) {
            let foundActive = false;
            data.threads.forEach(t => {
                const wrapper = document.createElement("div");
                wrapper.className = `chat-thread-btn ${t.thread_id === threadId ? 'active' : ''}`;
                wrapper.dataset.threadId = t.thread_id;
                wrapper.style.cssText = "display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; border-radius: 4px; padding: 0; cursor: pointer;";
                
                if (t.thread_id === threadId) {
                    foundActive = true;
                    wrapper.style.background = "var(--primary-light)";
                } else {
                    wrapper.style.background = "none";
                }
                
                wrapper.onmouseover = () => { if(!wrapper.classList.contains('active')) wrapper.style.background = "var(--bg-tertiary)"; };
                wrapper.onmouseout = () => { if(!wrapper.classList.contains('active')) wrapper.style.background = "none"; };
                
                const btn = document.createElement("div");
                btn.style.cssText = "padding: 8px; color: var(--text-primary); font-size: 0.9rem; flex-grow: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
                btn.textContent = t.title || "Chat";
                btn.onclick = () => switchChat(t.thread_id);
                
                const delBtn = document.createElement("button");
                delBtn.innerHTML = "×";
                delBtn.style.cssText = "background: none; border: none; color: var(--error); cursor: pointer; font-size: 1.2rem; padding: 0 8px; line-height: 1; opacity: 0.7; transition: opacity 0.2s;";
                delBtn.onmouseover = () => delBtn.style.opacity = "1";
                delBtn.onmouseout = () => delBtn.style.opacity = "0.7";
                delBtn.onclick = async (e) => {
                    e.stopPropagation();
                    // Removed confirm() as it can freeze Electron renderer
                    await fetch(`${getBaseUrl()}/api/chats/${t.thread_id}?username=${currentUsername}`, { method: 'DELETE' });
                    if(threadId === t.thread_id) threadId = null;
                    await loadChatHistory();
                };

                wrapper.appendChild(btn);
                wrapper.appendChild(delBtn);
                chatHistoryList.appendChild(wrapper);
            });
            
            if (!threadId || !foundActive) {
                switchChat(data.threads[0].thread_id);
            }
        } else {
            await createNewChat();
        }
    } catch (e) {
        console.error("Failed to load chat history", e);
        if (!threadId) await createNewChat();
    }
}

async function createNewChat() {
    try {
        const res = await fetch(`${getBaseUrl()}/api/chats?username=${currentUsername}`, { method: "POST" });
        const data = await res.json();
        await loadChatHistory(); // This will re-render list
        switchChat(data.thread_id);
    } catch (e) {
        console.error("Failed to create chat", e);
        if (!threadId) threadId = uuidv4(); // fallback
    }
}

if (newChatBtn) newChatBtn.addEventListener("click", createNewChat);

async function switchChat(newThreadId) {
    threadId = newThreadId;
    messagesContainer.innerHTML = "";
    emptyState.style.display = "flex";
    
    // Update UI
    document.querySelectorAll('.chat-thread-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = "none";
    });
    
    const activeBtn = Array.from(document.querySelectorAll('.chat-thread-btn')).find(b => b.dataset.threadId === newThreadId);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.background = "var(--primary-light)";
    }
    
    try {
        const res = await fetch(`${getBaseUrl()}/api/chats/${threadId}/history?username=${currentUsername}`);
        const data = await res.json();
        
        if (data.messages && data.messages.length > 0) {
            emptyState.style.display = "none";
            data.messages.forEach(m => {
                if (m.type === "user") addMessage(m.content, true);
                else if (m.type === "agent" || m.type === "ai") addMessage(m.content, false);
                else if (m.type === "system") addMessage(`**[System]** ${m.content}`, false);
            });
        }
    } catch (e) {
        console.error("Failed to load chat messages", e);
    }
}

loginButton.addEventListener("click", () => handleAuth(false));
registerButton.addEventListener("click", () => handleAuth(true));
passwordInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") handleAuth(false);
});

// ==================== Knowledge & Filesystem ====================
async function fetchOrgFilesForApp() {
    if (!orgFilesList) return;
    try {
        const response = await fetch(`${getBaseUrl()}/api/files/org`);
        const data = await response.json();
        const files = data.files || [];
        
        if (statOrgCount) statOrgCount.textContent = files.length;

        if (files.length === 0) {
            orgFilesList.innerHTML = '<div class="empty-state" style="padding:40px; text-align:center; color:var(--text-secondary); font-size:12px; border:1px dashed var(--border-color); border-radius:8px;">No organizational files found.</div>';
        } else {
            orgFilesList.innerHTML = files.map(f => renderFileItem(f)).join('');
        }
    } catch (e) {
        orgFilesList.innerHTML = '<div class="empty-state" style="color:var(--error-color);">Failed to load files</div>';
    }
}

function renderFileItem(f) {
    const ext = f.name.split('.').pop().toLowerCase();
    let iconColor = "var(--text-accent)";
    let icon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
    
    if (ext === 'pdf') { iconColor = "#ef4444"; }
    else if (['doc', 'docx'].includes(ext)) { iconColor = "#3b82f6"; }
    else if (['txt', 'md'].includes(ext)) { iconColor = "#94a3b8"; }
    else if (['jpg', 'png', 'svg'].includes(ext)) { iconColor = "#10b981"; }

    return `
        <div class="file-item" style="display:flex; align-items:center; gap:12px; padding:10px; background:rgba(255,255,255,0.03); border-radius:8px; border:1px solid var(--border-color); margin-bottom:4px; transition: transform 0.2s, background 0.2s; cursor: default;" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
            <div style="color:${iconColor}; background:rgba(0,0,0,0.2); padding:6px; border-radius:6px;">${icon}</div>
            <div style="flex:1;">
                <div style="font-size:12px; font-weight:500; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.name}</div>
                <div style="font-size:10px; color:var(--text-secondary); opacity:0.7;">${(f.size/1024).toFixed(1)} KB</div>
            </div>
        </div>
    `;
}

async function syncLocalFilesWithBackend() {
    if (!localFilesList) return;
    try {
        const files = await ipcRenderer.invoke('get-local-files');
        
        if (statLocalCount) statLocalCount.textContent = files.length;

        if (files.length === 0) {
            localFilesList.innerHTML = '<div class="empty-state" style="padding:40px; text-align:center; color:var(--text-secondary); font-size:12px; border:1px dashed var(--border-color); border-radius:8px;">No local files found in AutoFlowData.</div>';
        } else {
            localFilesList.innerHTML = files.map(f => renderFileItem(f)).join('');
        }

        // Send metadata to backend
        await fetch(`${getBaseUrl()}/api/files/local/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUsername || "admin",
                files: files
            })
        });
    } catch (e) {
        localFilesList.innerHTML = '<div class="empty-state" style="color:var(--error-color);">Failed to sync local files</div>';
    }
}

if (refreshLocalFilesBtn) {
    refreshLocalFilesBtn.addEventListener("click", syncLocalFilesWithBackend);
}

// ==================== Tasks Logic ====================
async function refreshTasks() {
    const btn = refreshTasksBtn;
    btn.disabled = true;
    try {
        const backendUrl = getBaseUrl();
        const response = await fetch(`${backendUrl}/api/tasks`);
        if (!response.ok) throw new Error("Failed to fetch tasks");
        const data = await response.json();
        
        const userTasks = (data.tasks || []).filter(t => t.username === currentUsername);
        
        tasksList.innerHTML = "";

        if (userTasks.length === 0) {
            tasksList.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 20px; gap:12px; color:var(--muted-foreground);">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    <p style="font-size:0.9rem; font-weight:500;">No scheduled tasks yet</p>
                    <p style="font-size:0.78rem; opacity:0.7;">Ask the agent to schedule something for you</p>
                </div>`;
            return;
        }
        
        userTasks.forEach(task => {
            const statusMap = {
                pending:    { color: "#60a5fa", bg: "#1e3a5f", icon: "⏳", label: "Pending" },
                processing: { color: "#f59e0b", bg: "#422006", icon: "⚙️", label: "Running" },
                completed:  { color: "#4ade80", bg: "#14532d", icon: "✅", label: "Done" },
                failed:     { color: "#f87171", bg: "#450a0a", icon: "❌", label: "Failed" },
            };
            const s = statusMap[task.status] || statusMap.pending;

            const scheduledTime = new Date(task.execution_time);
            const timeStr = scheduledTime.toLocaleString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: true
            });

            const el = document.createElement("div");
            el.style.cssText = `
                background: var(--card);
                border: 1px solid var(--border);
                border-left: 3px solid ${s.color};
                padding: 14px 16px;
                border-radius: 8px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                transition: box-shadow 0.2s;
            `;

            el.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
                    <div style="font-size:0.88rem; font-weight:600; color:var(--foreground); line-height:1.4; flex:1;">
                        ${task.original_prompt}
                    </div>
                    <div style="display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:999px;
                                background:${s.bg}; color:${s.color}; font-size:0.7rem; font-weight:700;
                                text-transform:uppercase; letter-spacing:0.05em; white-space:nowrap; flex-shrink:0;">
                        ${s.icon} ${s.label}
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:6px; font-size:0.75rem; color:var(--muted-foreground);">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    ${timeStr}
                    <span style="margin-left:auto; opacity:0.5;">ID #${task.id}</span>
                </div>
                ${task.result_log ? `
                <details style="font-size:0.75rem;">
                    <summary style="cursor:pointer; color:var(--muted-foreground); padding:4px 0; user-select:none;">
                        View execution log
                    </summary>
                    <pre style="margin-top:6px; background:#0f172a; padding:10px; border-radius:6px;
                                font-family:monospace; font-size:0.72rem; color:#94a3b8;
                                white-space:pre-wrap; word-break:break-word; max-height:200px; overflow-y:auto;">
${task.result_log.trim()}</pre>
                </details>` : ''}
            `;
            tasksList.appendChild(el);
        });
        
    } catch (e) {
        showToast("Error", "Could not refresh tasks: " + e.message, "destructive");
    } finally {
        btn.disabled = false;
    }
}

refreshTasksBtn.addEventListener("click", refreshTasks);

// ==================== Task Notification Poller ====================
async function pollTaskNotifications(isInitialLoad = false) {
    if (!currentUsername) return;
    
    try {
        const backendUrl = getBaseUrl();
        const response = await fetch(`${backendUrl}/api/tasks`);
        if (!response.ok) return;
        
        const data = await response.json();
        const userTasks = (data.tasks || []).filter(t => t.username === currentUsername);
        
        userTasks.forEach(task => {
            const isTerminal = (task.status === 'completed' || task.status === 'failed');
            
            if (isTerminal) {
                if (isInitialLoad) {
                    // On first load, just mark existing finished tasks as "already notified"
                    notifiedTaskIds.add(task.id);
                } else if (!notifiedTaskIds.has(task.id)) {
                    // New completion detected!
                    notifiedTaskIds.add(task.id);
                    
                    const title = task.status === 'completed' ? "Task Successful" : "Task Failed";
                    const icon = task.status === 'completed' ? "✅" : "❌";
                    const message = `Task: ${task.original_prompt.substring(0, 50)}${task.original_prompt.length > 50 ? '...' : ''}`;
                    
                    // 1. Show UI Toast
                    showToast(title, message, task.status === 'completed' ? "default" : "destructive");
                    
                    // 2. Show Native OS Notification
                    if (Notification.permission === "granted") {
                        new Notification(`AutoFlowAI: ${title}`, {
                            body: message,
                            silent: false
                        });
                    }
                    
                    // 3. Refresh the tasks list if the user is on that tab
                    const activeTab = document.querySelector('.nav-tab.active');
                    if (activeTab && activeTab.dataset.tab === 'tasks') {
                        refreshTasks();
                    }
                }
            }
        });
    } catch (e) {
        console.error("Poller error:", e);
    }
}

// Request notification permission on startup
if (window.Notification && Notification.permission !== "granted") {
    Notification.requestPermission();
}

// Start periodic polling (every 15 seconds)
setInterval(() => pollTaskNotifications(false), 15000);

// ==================== Email Settings Logic ====================
saveEmailBtn.addEventListener("click", async () => {
    const backendUrl = getBaseUrl();
    
    if (!currentUsername) {
        showToast("Error", "You must be logged in to save credentials", "destructive");
        return;
    }
    
    const smtpServer = settingSmtpServer.value.trim();
    const smtpPort = settingSmtpPort.value.trim();
    const senderEmail = settingSenderEmail.value.trim();
    const senderPassword = settingSenderPassword.value.trim();

    if (!smtpServer || !smtpPort || !senderEmail || !senderPassword) {
        showToast("Error", "All email fields are required", "destructive");
        return;
    }
    
    try {
        saveEmailBtn.textContent = "Saving...";
        const payload = {
            username: currentUsername,
            smtp_server: smtpServer,
            smtp_port: parseInt(smtpPort || "587"),
            sender_email: senderEmail,
            sender_password: senderPassword
        };
        
        const response = await fetch(`${backendUrl}/api/user/email-config`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || "Failed to save configuration");
        }
        showToast("Success", "Email configuration saved securely!");
    } catch (e) {
        showToast("Error", e.message, "destructive");
    } finally {
        saveEmailBtn.textContent = "Save Credentials";
    }
});

// ==================== Gemini Settings Logic ====================
const settingGeminiKey = document.getElementById("setting-gemini-key");
const saveGeminiBtn = document.getElementById("save-gemini-btn");

saveGeminiBtn.addEventListener("click", async () => {
    const backendUrl = getBaseUrl();
    
    if (!currentUsername) {
        showToast("Error", "You must be logged in to save API keys", "destructive");
        return;
    }
    
    const apiKey = settingGeminiKey.value.trim();

    if (!apiKey) {
        showToast("Error", "API Key cannot be empty", "destructive");
        return;
    }
    
    try {
        saveGeminiBtn.textContent = "Saving...";
        const payload = {
            username: currentUsername,
            api_key: apiKey
        };
        
        const response = await fetch(`${backendUrl}/api/user/gemini-config`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || "Failed to save configuration");
        }
        showToast("Success", "Gemini API Key saved!");
    } catch (e) {
        showToast("Error", e.message, "destructive");
    } finally {
        saveGeminiBtn.textContent = "Save API Key";
    }
});

// Model Preference Logic
const saveModelPrefBtn = document.getElementById("save-model-pref-btn");
const modelRadios = document.getElementsByName("model-choice");

saveModelPrefBtn.addEventListener("click", async () => {
    let selected = "local";
    modelRadios.forEach(r => {
        if (r.checked) selected = r.value;
    });
    
    modelPreference = selected;
    localStorage.setItem("modelPreference", selected);
    updateModelStatusBar(selected);
    
    // Sync with backend so scheduled tasks know what to use
    try {
        const backendUrl = getBaseUrl();
        await fetch(`${backendUrl}/api/user/preference`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: currentUsername || "admin", 
                preferred_model: selected 
            })
        });
        showToast("Preference Saved", `Model preference set to ${selected === 'cloud' ? 'Cloud (Gemini)' : 'Local (Ollama)'}`);
    } catch (e) {
        console.error("Failed to sync preference with backend:", e);
        showToast("Saved Locally", "Saved in app, but failed to sync with server", "destructive");
    }
});

function loadModelPreference() {
    const saved = localStorage.getItem("modelPreference") || "local";
    modelPreference = saved;
    modelRadios.forEach(r => {
        if (r.value === saved) r.checked = true;
    });
    updateModelStatusBar(saved);
}

function updateModelStatusBar(preference, confirmedModel) {
    const geminiEl = document.getElementById("active-model-badge");
    const localEl = document.getElementById("active-model-local");
    const labelEl = document.getElementById("active-model-label");
    const localLabelEl = document.getElementById("active-model-local-label");
    if (!geminiEl || !localEl) return;

    // If we have a confirmed model name from the server
    const modelName = confirmedModel || null;
    const isCloud = modelName ? modelName.toLowerCase().includes("gemini") : preference === "cloud";

    if (isCloud) {
        geminiEl.style.display = "flex";
        geminiEl.style.color = "#10b981";
        geminiEl.style.background = "#064e3b";
        geminiEl.style.border = "1px solid #059669";
        labelEl.textContent = modelName ? modelName.toUpperCase() : "GEMINI 2.5 FLASH";
        localEl.style.display = "none";
    } else {
        localEl.style.display = "flex";
        localLabelEl.textContent = modelName ? modelName.toUpperCase() : "LOCAL OLLAMA MODEL";
        geminiEl.style.display = "none";
    }
}

// Load existing credentials after login
async function loadEmailCredentials() {
    try {
        const res = await fetch(`${getBaseUrl()}/api/users`);
        if (!res.ok) return;
        const data = await res.json();
        const userRecord = (data.users || []).find(u => u.username === currentUsername);
        if (userRecord && userRecord.email_config) {
            settingSmtpServer.value = userRecord.email_config.smtp_server || '';
            settingSmtpPort.value = userRecord.email_config.smtp_port || '';
            settingSenderEmail.value = userRecord.email_config.sender_email || '';
            // Password intentionally not pre-filled
        }
        
        // Load generic credentials (like Gemini API)
        if (userRecord && userRecord.credentials) {
            const geminiCred = userRecord.credentials.find(c => c.service_name === 'gemini' && c.credential_key === 'api_key');
            if (geminiCred) {
                settingGeminiKey.value = geminiCred.credential_value || '';
            }
        }

    } catch(e) {
        // Silent — credentials will just be blank
    }
}


// ==================== Sidebar & Server List Logic ====================
async function refreshServerSidebar() {
    try {
        const apiUrl = `${getBaseUrl()}/api/mcp/servers`;

        const res = await fetch(apiUrl);
        if(!res.ok) return;
        const data = await res.json();
        const servers = data.servers || {};

        let listContainer = document.getElementById('server-list-container');
        if (!listContainer) return;
        
        listContainer.innerHTML = "";

        Object.entries(servers).forEach(([name, config]) => {
            const item = document.createElement('div');
            item.innerHTML = `
                <div style="width:6px; height:6px; background:#4caf50; border-radius:50%; box-shadow: 0 0 5px #4caf50;"></div>
                <span style="font-size:0.85rem; color:var(--text-primary); font-weight:500; text-transform:capitalize;">${name}</span>
            `;
            item.style.display = "flex";
            item.style.alignItems = "center";
            item.style.gap = "10px";
            item.style.padding = "6px 10px";
            item.style.borderRadius = "6px";
            item.style.marginBottom = "4px";
            item.style.background = "var(--bg-secondary)";
            listContainer.appendChild(item);
        });

    } catch (e) {
        console.error("Failed to load server list", e);
    }
}

// Add Server Modal Logic
const modalHTML = `
<div id="server-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:9999; align-items:center; justify-content:center; backdrop-filter:blur(5px);">
  <div style="background:#0f172a; padding:24px; border-radius:12px; width:400px; border:1px solid #334155; box-shadow:0 20px 25px -5px rgba(0,0,0,0.5);">
    <h3 style="color:white; margin:0 0 16px 0; font-size:1.2rem;">Add MCP Server</h3>
    
    <div style="margin-bottom:12px;">
        <label style="display:block; color:#94a3b8; font-size:12px; margin-bottom:6px;">Name</label>
        <input id="new-server-name" placeholder="hackernews" style="width:100%; padding:10px; background:#1e293b; border:1px solid #334155; color:white; border-radius:6px; outline:none;">
    </div>
    
    <div style="margin-bottom:12px;">
        <label style="display:block; color:#94a3b8; font-size:12px; margin-bottom:6px;">Transport</label>
        <select id="new-server-transport" style="width:100%; padding:10px; background:#1e293b; border:1px solid #334155; color:white; border-radius:6px; outline:none;">
            <option value="sse">SSE (URL)</option>
            <option value="stdio">STDIO (Local Command)</option>
        </select>
    </div>

    <div id="sse-fields">
        <div style="margin-bottom:12px;">
            <label style="display:block; color:#94a3b8; font-size:12px; margin-bottom:6px;">URL</label>
            <input id="new-server-url" placeholder="https://..." style="width:100%; padding:10px; background:#1e293b; border:1px solid #334155; color:white; border-radius:6px; outline:none;">
        </div>
        
        <div style="margin-bottom:12px;">
            <label style="display:block; color:#94a3b8; font-size:12px; margin-bottom:6px;">Headers (JSON) - For API Keys</label>
            <input id="new-server-headers" placeholder='{"x-api-key": "..."}' style="width:100%; padding:10px; background:#1e293b; border:1px solid #334155; color:white; border-radius:6px; outline:none; font-family:monospace;">
        </div>
    </div>

    <div id="stdio-fields" style="display:none;">
        <div style="margin-bottom:12px;">
            <label style="display:block; color:#94a3b8; font-size:12px; margin-bottom:6px;">Command</label>
            <input id="new-server-cmd" placeholder="python" style="width:100%; padding:10px; background:#1e293b; border:1px solid #334155; color:white; border-radius:6px; outline:none;">
        </div>
        <div style="margin-bottom:12px;">
            <label style="display:block; color:#94a3b8; font-size:12px; margin-bottom:6px;">Args</label>
            <input id="new-server-args" placeholder="-u script.py" style="width:100%; padding:10px; background:#1e293b; border:1px solid #334155; color:white; border-radius:6px; outline:none;">
        </div>
    </div>

    <div style="display:flex; gap:10px; margin-top:20px;">
        <button id="cancel-server-btn" style="flex:1; padding:10px; background:#334155; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:500;">Cancel</button>
        <button id="save-server-btn" style="flex:1; padding:10px; background:#2563eb; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:500;">Connect</button>
    </div>
  </div>
</div>
`;
document.body.insertAdjacentHTML('beforeend', modalHTML);

document.getElementById("add-server-btn")?.addEventListener("click", () => {
    document.getElementById('server-modal').style.display = 'flex';
});

document.getElementById('cancel-server-btn').onclick = () => {
    document.getElementById('server-modal').style.display = 'none';
};

const transportSelect = document.getElementById('new-server-transport');
const sseFields = document.getElementById('sse-fields');
const stdioFields = document.getElementById('stdio-fields');

transportSelect.onchange = () => {
    if(transportSelect.value === 'sse') {
        sseFields.style.display = 'block';
        stdioFields.style.display = 'none';
    } else {
        sseFields.style.display = 'none';
        stdioFields.style.display = 'block';
    }
};

document.getElementById('save-server-btn').onclick = async () => {
    const name = document.getElementById('new-server-name').value;
    const transport = transportSelect.value;
    const payload = { name, transport };

    if (transport === 'sse') {
        payload.url = document.getElementById('new-server-url').value;
        const headersStr = document.getElementById('new-server-headers').value;
        if (headersStr) {
            try {
                payload.headers = JSON.parse(headersStr);
            } catch(e) {
                alert("Invalid JSON in Headers field.");
                return;
            }
        }
    } else {
        payload.command = document.getElementById('new-server-cmd').value;
        payload.args = document.getElementById('new-server-args').value.split(" ");
    }

    try {
        const backendUrl = backendUrlInput.value.trim();
        const urlObj = new URL(backendUrl);
        const apiUrl = `${urlObj.protocol}//${urlObj.host}/api/mcp/servers`;

        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(await res.text());
        
        document.getElementById('server-modal').style.display = 'none';
        refreshServerSidebar(); 
        showToast("Success", "Server Added Successfully");
        
    } catch(e) {
        alert("Failed to add server: " + e.message);
    }
};

// ==================== Theme ====================
function updateThemeIcon(isDark) {
  if (isDark) {
    themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
  } else {
    themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
  }
}

themeSwitch.addEventListener("change", () => {
  const isDark = themeSwitch.checked;
  document.body.classList.toggle("dark", isDark);
  updateThemeIcon(isDark);
});

// ==================== IPC Listeners ====================
ipcRenderer.on('mcp-status', (event, status) => {
    if (status === 'starting') {
        mcpStatus.className = 'status-dot status-warning';
        mcpUrlInput.value = "Negotiating Tunnel...";
    }
});

ipcRenderer.on('ngrok-url', (event, url) => {
    mcpUrlInput.value = url;
    mcpStatus.className = 'status-dot status-success';
    mcpStatus.title = "Tunnel Active & Ready";
    mcpUrlInput.style.color = "#4caf50";
    setTimeout(() => mcpUrlInput.style.color = "", 1000);
    showToast("MCP Online", "File System Server is now accessible externally", "default");
});

ipcRenderer.on('mcp-error', (event, msg) => {
    if (!mcpUrlInput.value || !mcpUrlInput.value.startsWith('http')) {
        mcpUrlInput.value = "Local only: http://localhost:3005/sse";
    }
    mcpStatus.className = 'status-dot status-error';
    mcpStatus.title = msg;
    showToast("MCP Tunnel Error", `${msg}. Local MCP remains available.`, "destructive");
});

// ==================== Check LLM ====================
const checkLlmBtn = document.getElementById("check-llm-btn");
if (checkLlmBtn) {
    checkLlmBtn.addEventListener("click", async () => {
        const btn = checkLlmBtn;
        const prevText = btn.innerHTML;
        btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 0.8s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Checking...`;
        btn.disabled = true;

        const pref = modelPreference;
        try {
            const backendUrl = getBaseUrl();
            let activeModel, reason;

            if (pref === "local") {
                activeModel = "Local Ollama (Qwen3:4b)";
                reason = "Preference set to Local.";
            } else {
                // Check if Gemini key is stored
                const res = await fetch(`${backendUrl}/api/users`);
                const data = await res.json();
                const user = (data.users || []).find(u => u.username === currentUsername);
                const geminiKey = user?.credentials?.find(c => c.service_name === "gemini" && c.credential_key === "api_key");
                if (geminiKey) {
                    activeModel = "Cloud — Gemini 2.5 Flash";
                    reason = "API key found. Using Gemini.";
                } else {
                    activeModel = "Local Ollama (Qwen3:4b)";
                    reason = "Preference is Cloud but no API key found — falling back to Local.";
                }
            }

            updateModelStatusBar(pref, activeModel.includes("Gemini") ? "Gemini 2.5 Flash" : "Local Qwen3 4B");
            showToast(`🤖 Active LLM: ${activeModel}`, reason, "default");
        } catch(e) {
            showToast("Check Failed", "Could not determine active model.", "destructive");
        } finally {
            btn.innerHTML = prevText;
            btn.disabled = false;
        }
    });
}

// ==================== Config Panel Actions ====================
async function testBackendConnection() {
    const url = getBaseUrl();
    if (!url) return;

    backendStatus.className = "status-dot status-warning";
    backendStatus.title = "Testing...";

    try {
        const response = await fetch(`${url}/`);
        if (response.ok) {
            backendStatus.className = "status-dot status-success";
            backendStatus.title = "Connected";
            return true;
        } else {
            throw new Error("Status " + response.status);
        }
    } catch (err) {
        backendStatus.className = "status-dot status-error";
        backendStatus.title = "Connection Failed";
        return false;
    }
}

testBackendBtn.addEventListener("click", async () => {
    localStorage.setItem("backendUrl", getBaseUrl());
    showToast("Testing...", "Pinging Backend Agent");
    const success = await testBackendConnection();
    if(success) showToast("Connected", "Backend Agent is reachable", "default");
    else showToast("Failed", "Could not reach Backend Agent", "destructive");
});

backendUrlInput.addEventListener("change", () => {
    localStorage.setItem("backendUrl", getBaseUrl());
});

copyMcpBtn.addEventListener("click", () => {
  if (mcpUrlInput.value && mcpUrlInput.value.startsWith('http')) {
      navigator.clipboard.writeText(mcpUrlInput.value);
      showToast("Copied", "MCP URL copied to clipboard");
  } else {
      showToast("Wait", "Tunnel URL not ready yet", "destructive");
  }
});

testMcpBtn.addEventListener("click", async () => {
  try {
      const response = await fetch('http://localhost:3005/sse'); 
      if (response.ok || response.status === 200) {
          showToast("Healthy", "Local MCP Node is running (Port 3005)", "default");
      } else {
          showToast("Warning", "MCP Node responded with status: " + response.status, "destructive");
      }
  } catch (e) {
      showToast("Error", "Local MCP Node is DOWN", "destructive");
  }
});

// ==================== Chat Logic ====================
function createMessageElement(content, isUser, time) {
  const div = document.createElement("div");
  div.className = `message ${isUser ? "user" : "assistant"}`;
  
  const iconPath = isUser
    ? '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>'
    : '<path d="M12 8V4H8"></path><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="6" y="14" width="12" height="8" rx="2" ry="2"></rect><line x1="12" y1="10" x2="12" y2="14"></line>';
  
  div.innerHTML = `
    <div class="message-avatar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        ${iconPath}
      </svg>
    </div>
    <div class="message-content">
      ${content} <div class="message-time">${time}</div>
    </div>
  `;
  
  return div;
}

function addMessage(content, isUser) {
  if (emptyState) emptyState.style.display = "none";
  const time = getTime();
  const messageEl = createMessageElement(content, isUser, time);
  messagesContainer.appendChild(messageEl);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  return messageEl.querySelector('.message-content');
}

async function handleSendMessage() {
  const content = messageInput.value.trim();
  let url = backendUrlInput.value.trim();
  
  if (!content) return;

  addMessage(content, true);
  messageInput.value = "";
  adjustTextareaHeight();
  sendButton.disabled = true;

  const botContentDiv = addMessage('<span id="cursor">Thinking...</span>', false);
  const botMessageBubble = botContentDiv.closest('.message'); 
  
  if (window.currentChatController) {
      window.currentChatController.abort();
  }
  window.currentChatController = new AbortController();
  
  const stopButton = document.getElementById('stop-button');
  if (stopButton) {
      stopButton.style.display = 'block';
      sendButton.style.display = 'none';
      stopButton.onclick = () => {
          if (window.currentChatController) {
              window.currentChatController.abort();
              botContentDiv.innerHTML += '<br><em>[Stopped by user]</em>';
              stopButton.style.display = 'none';
              sendButton.style.display = 'block';
              sendButton.disabled = false;
          }
      };
  }

  try {
    // Always build the chat URL from the clean base origin
    const baseUrl = new URL(url).origin;
    url = baseUrl + '/agent/stream';

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
          message: content, 
          thread_id: threadId || "default_user",
          username: currentUsername || "admin",
          preferred_model: modelPreference
      }),
      signal: window.currentChatController.signal
    });

    if (!response.ok) throw new Error(`Server Error: ${response.status}`);

    botContentDiv.innerHTML = ""; 
    const timeDiv = document.createElement("div"); 
    timeDiv.className = "message-time";
    timeDiv.innerText = getTime();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(l => l.trim());

      for (const line of lines) {
        try {
          const event = JSON.parse(line);

          if (event.type === 'model_info') {
              // Update the fixed model status bar — NOT a floating badge
              updateModelStatusBar(modelPreference, event.model);
          }

          if (event.type === 'tool_use') {
              const badgeWrapper = document.createElement('div');
              badgeWrapper.className = 'tool-usage-row'; 
              badgeWrapper.style.display = 'flex';
              badgeWrapper.style.justifyContent = 'flex-start';
              badgeWrapper.style.padding = '0 1rem 0.5rem 3.5rem';
              
              badgeWrapper.innerHTML = `
                 <div class="tool-badge" style="display:inline-flex; align-items:center; gap:8px; font-size:0.75rem; color:#94a3b8; background:#0f172a; border:1px solid #1e293b; padding:6px 12px; border-radius:999px; font-family:monospace;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                    </svg>
                    <span>Used Tool: <b style="color:#60a5fa;">${event.tool}</b></span>
                 </div>
              `;
              messagesContainer.insertBefore(badgeWrapper, botMessageBubble);
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }

          if (event.type === 'time_taken') {
              const elapsed = parseFloat(event.elapsed);
              let timeStr = "";
              if (elapsed < 60) {
                  timeStr = `${elapsed.toFixed(1)}s`;
              } else {
                  const m = Math.floor(elapsed / 60);
                  const s = Math.floor(elapsed % 60);
                  timeStr = `${m}m ${s}s`;
              }
              timeDiv.innerText = `${getTime()} • Time taken: ${timeStr}`;
              timeDiv.style.opacity = "0.7";
          }

          const chunkContent = (event.type === 'message' ? event.content : "") || "";
          
          if (chunkContent) {
             accumulatedText += chunkContent;
             if (window.marked) {
                 botContentDiv.innerHTML = marked.parse(accumulatedText);
             } else {
                 botContentDiv.innerText = accumulatedText;
             }

             botContentDiv.appendChild(timeDiv); 
             messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
        } catch (e) { /* ignore parse errors */ }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
        console.log("Chat request aborted");
    } else {
        botContentDiv.innerHTML = `<span style="color: #ff6b6b">Error: ${err.message}</span>`;
    }
  } finally {
    const cursor = botContentDiv.querySelector('#cursor');
    if (cursor) cursor.remove();
    sendButton.disabled = false;
    if (stopButton) {
        stopButton.style.display = 'none';
        sendButton.style.display = 'block';
    }
    window.currentChatController = null;
    loadChatHistory();
  }
}

function adjustTextareaHeight() {
  messageInput.style.height = "auto";
  const newHeight = Math.min(messageInput.scrollHeight, 200);
  messageInput.style.height = newHeight + "px";
}

messageInput.addEventListener("input", () => {
  adjustTextareaHeight();
  sendButton.disabled = !messageInput.value.trim();
});

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (messageInput.value.trim()) {
      handleSendMessage();
    }
  }
});

sendButton.addEventListener("click", handleSendMessage);

document.addEventListener("DOMContentLoaded", () => {
  updateThemeIcon(themeSwitch.checked);
  
  // Load and normalize saved backend URL - strip any path suffixes
  const savedUrl = localStorage.getItem("backendUrl");
  if (savedUrl) {
    try {
      const normalized = new URL(savedUrl).origin; // Always strip /agent/stream etc.
      backendUrlInput.value = normalized;
      localStorage.setItem("backendUrl", normalized); // Save clean version
    } catch(e) {
      backendUrlInput.value = "http://localhost:8000";
    }
  }
  
  
  loadModelPreference();
  usernameInput.focus();
});
