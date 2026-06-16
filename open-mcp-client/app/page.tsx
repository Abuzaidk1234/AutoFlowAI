"use client";

import { useState, useEffect } from "react";

// --- ICONS ---
interface IconProps {
  className?: string;
  size?: number;
}

const Icons = {
  Cpu: ({ className, size = 24 }: IconProps) => <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} width={size} height={size}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z" /></svg>,
  Users: ({ className, size = 24 }: IconProps) => <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} width={size} height={size}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>,
  Server: ({ className, size = 24 }: IconProps) => <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} width={size} height={size}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.072 0 2.045.507 2.7 1.35l2.087 3.45a4.5 4.5 0 0 1 .9 2.7" /></svg>,
  Trash: ({ className, size = 16 }: IconProps) => <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} width={size} height={size}><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>,
  Plus: ({ className, size = 16 }: IconProps) => <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} width={size} height={size}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>,
  Eye: ({ className, size = 16 }: IconProps) => <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} width={size} height={size}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>,
  EyeOff: ({ className, size = 16 }: IconProps) => <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} width={size} height={size}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>,
  FileText: ({ className, size = 24 }: IconProps) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>
};

const API_URL = "http://localhost:8000";

export default function AdminDashboard() {
  const [servers, setServers] = useState<any>({});
  const [tasks, setTasks] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [orgFiles, setOrgFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [addCredModal, setAddCredModal] = useState<{open: boolean; username: string}>({open: false, username: ""});
  const [newCred, setNewCred] = useState({ service_name: "", credential_key: "", credential_value: "" });
  // Stores revealed passwords by username — fetched on-demand, never in initial data
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string | null>>({});
  // Stores IDs of credentials that are currently revealed
  const [revealedCredentials, setRevealedCredentials] = useState<Record<number, boolean>>({});
  // Stores expanded state for tasks
  const [expandedTasks, setExpandedTasks] = useState<Record<number, boolean>>({});

  // Active Tab State
  const [activeTab, setActiveTab] = useState<"users" | "mcp" | "tasks" | "rag">("users");

  const toggleTask = (taskId: number) => {
    setExpandedTasks(prev => ({...prev, [taskId]: !prev[taskId]}));
  };

  
  // New Server Form State
  const [newServer, setNewServer] = useState({
    name: "",
    transport: "stdio",
    command: "",
    args: "",
    url: "",
    headers: "" // New Field for JSON Headers
  });

  // Fetch Servers
  const fetchServersAndTasks = async () => {
    try {
      const [resServers, resTasks, resUsers, resFiles] = await Promise.all([
        fetch(`${API_URL}/api/mcp/servers`),
        fetch(`${API_URL}/api/tasks`),
        fetch(`${API_URL}/api/users`),
        fetch(`${API_URL}/api/files/org`)
      ]);
      if (resServers.ok) setServers((await resServers.json())?.servers || {});
      else setServers({});
      if (resTasks.ok) setTasks((await resTasks.json())?.tasks || []);
      if (resUsers.ok) setUsers((await resUsers.json())?.users || []);
      if (resFiles.ok) setOrgFiles((await resFiles.json())?.files || []);
    } catch (e) {
      console.error("Failed to fetch data", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServersAndTasks();
  }, []);

  // Add Server Handler
  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      name: newServer.name,
      transport: newServer.transport
    };

    if (newServer.transport === "stdio") {
      payload.command = newServer.command;
      payload.args = newServer.args.split(" ").filter(a => a);
    } else {
      payload.url = newServer.url;
      // Parse Headers JSON
      if (newServer.headers.trim()) {
        try {
          payload.headers = JSON.parse(newServer.headers);
        } catch (error) {
          alert("Invalid JSON format in Headers field. Example: {\"x-api-key\": \"123\"}");
          return;
        }
      }
    }

    try {
      await fetch(`${API_URL}/api/mcp/servers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      setIsModalOpen(false);
      fetchServersAndTasks(); // Refresh list
      setNewServer({ name: "", transport: "stdio", command: "", args: "", url: "", headers: "" });
    } catch (e) {
      alert("Failed to add server");
    }
  };

  // Delete Server Handler
  const handleDelete = async (name: string) => {
    if(!confirm(`Delete ${name}?`)) return;
    await fetch(`${API_URL}/api/mcp/servers/${name}`, { method: "DELETE" });
    fetchServersAndTasks();
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!confirm(`Are you sure you want to delete this task?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/tasks/${taskId}`, { method: 'DELETE' });
      if (res.ok) fetchServersAndTasks();
    } catch (err) {
      console.error(err);
    }
  };

  // Delete User Handler
  const handleDeleteUser = async (username: string) => {
    if(!confirm(`Delete user "${username}" and all their data?`)) return;
    await fetch(`${API_URL}/api/users/${username}`, { method: "DELETE" });
    fetchServersAndTasks();
  };

  // Delete Credential Handler
  const handleDeleteCred = async (credId: number) => {
    if(!confirm("Delete this credential?")) return;
    await fetch(`${API_URL}/api/user/credentials/${credId}`, { method: "DELETE" });
    fetchServersAndTasks();
  };

  // Add Generic Credential
  const handleAddCred = async () => {
    if (!newCred.service_name || !newCred.credential_key || !newCred.credential_value) {
      alert("All fields are required."); return;
    }
    await fetch(`${API_URL}/api/user/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: addCredModal.username, ...newCred })
    });
    setAddCredModal({ open: false, username: "" });
    setNewCred({ service_name: "", credential_key: "", credential_value: "" });
    fetchServersAndTasks();
  };

  // Toggle SMTP password reveal — fetched on-demand, never pre-loaded in the page
  const togglePassword = async (username: string) => {
    if (revealedPasswords[username] !== undefined) {
      // Hide if already revealed
      setRevealedPasswords(prev => { const n = {...prev}; delete n[username]; return n; });
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/smtp-password/${username}`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setRevealedPasswords(prev => ({ ...prev, [username]: data.password }));
      // Auto-hide after 15 seconds for security
      setTimeout(() => {
        setRevealedPasswords(prev => { const n = {...prev}; delete n[username]; return n; });
      }, 15000);
    } catch {
      alert("No SMTP password saved for this user.");
    }
  };

  const toggleCredential = (credId: number) => {
    setRevealedCredentials(prev => ({
      ...prev,
      [credId]: !prev[credId]
    }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("filename", file.name);
    try {
      await fetch(`${API_URL}/api/files/org/upload`, {
        method: "POST",
        body: formData
      });
      fetchServersAndTasks(); // Refresh
    } catch (e) {
      alert("Upload failed");
    }
  };

  const handleDeleteFile = async (filename: string) => {
    if (!confirm(`Delete ${filename} from Knowledge Base?`)) return;
    try {
      await fetch(`${API_URL}/api/files/org/${filename}`, { method: "DELETE" });
      fetchServersAndTasks();
    } catch (e) {
      alert("Delete failed");
    }
  };

  return (
    <div className="space-y-8 relative">
      
      {/* Intro */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
          <p className="text-gray-400">Manage MCP Connections & Agent Status</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Active Threads" value="1" sub="Session Active" icon={<Icons.Users />} color="text-blue-400" />
        <StatCard title="MCP Servers" value={Object.keys(servers).length} sub="Connected" icon={<Icons.Server />} color="text-purple-400" />
        <StatCard title="Model" value="Qwen3:4b" sub="Ollama" icon={<Icons.Cpu />} color="text-green-400" />
      </div>

      {/* Tabs Navbar */}
      <div className="flex space-x-6 border-b border-gray-800 overflow-x-auto pb-[-1px]">
        <button onClick={() => setActiveTab('users')} className={`pb-3 px-2 font-medium whitespace-nowrap transition-colors ${activeTab === 'users' ? 'text-blue-400 border-b-2 border-blue-400 translate-y-[1px]' : 'text-gray-400 hover:text-gray-200'}`}>Users & Credentials</button>
        <button onClick={() => setActiveTab('mcp')} className={`pb-3 px-2 font-medium whitespace-nowrap transition-colors ${activeTab === 'mcp' ? 'text-blue-400 border-b-2 border-blue-400 translate-y-[1px]' : 'text-gray-400 hover:text-gray-200'}`}>MCP Servers</button>
        <button onClick={() => setActiveTab('tasks')} className={`pb-3 px-2 font-medium whitespace-nowrap transition-colors ${activeTab === 'tasks' ? 'text-blue-400 border-b-2 border-blue-400 translate-y-[1px]' : 'text-gray-400 hover:text-gray-200'}`}>Scheduled Tasks</button>
        <button onClick={() => setActiveTab('rag')} className={`pb-3 px-2 font-medium whitespace-nowrap transition-colors ${activeTab === 'rag' ? 'text-blue-400 border-b-2 border-blue-400 translate-y-[1px]' : 'text-gray-400 hover:text-gray-200'}`}>Organizational Knowledge</button>
      </div>

      {activeTab === 'mcp' && (
      /* Server List Panel */
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mt-6">
        <div className="p-6 border-b border-gray-800 flex justify-between items-center">
          <h2 className="font-semibold text-lg text-white">Active MCP Servers</h2>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded flex items-center gap-2 transition"
          >
            <Icons.Plus /> Add Server
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          {loading ? <div className="text-gray-500">Loading...</div> : 
           Object.keys(servers).length === 0 ? <div className="text-gray-500">No servers connected.</div> :
           Object.entries(servers).map(([name, config]: any) => (
            <div key={name} className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700/50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400">
                  <Icons.Server />
                </div>
                <div>
                  <div className="font-medium text-white capitalize">{name}</div>
                  <div className="text-xs text-gray-500 font-mono mt-0.5">
                    {config.transport === 'stdio' ? config.command : config.url}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right mr-4">
                  <div className="text-xs text-gray-400 mb-1">Transport</div>
                  <div className="text-xs font-mono bg-gray-950 px-2 py-1 rounded text-purple-300 uppercase">{config.transport}</div>
                </div>
                <button onClick={() => handleDelete(name)} className="text-gray-500 hover:text-red-400 transition p-2">
                  <Icons.Trash />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {activeTab === 'tasks' && (
      /* Scheduled Tasks Panel */
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mt-6">
        <div className="p-6 border-b border-gray-800 flex justify-between items-center">
          <h2 className="font-semibold text-lg text-white">System Scheduled Tasks</h2>
          <button 
            onClick={fetchServersAndTasks}
            className="text-xs bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded transition"
          >
            Refresh Tasks
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          {loading ? <div className="text-gray-500">Loading...</div> : 
           tasks.length === 0 ? <div className="text-gray-500">No scheduled tasks found.</div> :
           tasks.map((task: any) => (
            <div key={task.id} className="flex flex-col p-4 bg-gray-800/50 rounded-lg border border-gray-700/50 gap-2">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium text-white">{task.original_prompt}</div>
                  <div className="text-xs text-gray-500 font-mono mt-1">User: {task.username}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`px-2 py-1 rounded text-xs font-bold uppercase ${task.status === 'completed' ? 'bg-green-500/20 text-green-400' : task.status === 'processing' ? 'bg-yellow-500/20 text-yellow-400' : task.status === 'failed' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}`}>
                    {task.status}
                  </div>
                  <button 
                    onClick={() => handleDeleteTask(task.id)}
                    className="text-gray-600 hover:text-red-400 transition p-1"
                    title="Delete task"
                  >
                    <Icons.Trash />
                  </button>
                </div>
              </div>
              <div className="text-xs text-gray-400 mt-2 flex justify-between items-center">
                <span>Scheduled For: {new Date(task.execution_time).toLocaleString()}</span>
                {task.result_log && (
                  <button 
                    onClick={() => toggleTask(task.id)}
                    className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 transition"
                  >
                    {expandedTasks[task.id] ? "Hide Details" : "View Details"}
                  </button>
                )}
              </div>
              {task.result_log && expandedTasks[task.id] && (
                <div className="mt-2 bg-gray-950 p-3 rounded-md text-xs text-gray-400 font-mono whitespace-pre-wrap border border-gray-800/50">
                  {task.result_log}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      )}

      {activeTab === 'rag' && (
      /* Knowledge Base (RAG) Panel */
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mt-6">
        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-800/30">
          <div>
            <h2 className="font-semibold text-lg text-white flex items-center gap-2">
              <Icons.FileText className="text-blue-400" />
              Organizational Knowledge
            </h2>
            <p className="text-xs text-gray-400 mt-1">Shared documents indexed for AI Context (RAG)</p>
          </div>
          <div className="flex items-center gap-4">
             <div className="hidden sm:flex items-center gap-4 px-4 py-1.5 bg-gray-950 rounded-lg border border-gray-800">
                <div className="text-center">
                  <div className="text-[10px] text-gray-500 uppercase">Files</div>
                  <div className="text-sm font-bold text-white">{orgFiles.length}</div>
                </div>
                <div className="w-px h-6 bg-gray-800"></div>
                <div className="text-center">
                  <div className="text-[10px] text-gray-500 uppercase">Storage</div>
                  <div className="text-sm font-bold text-white">{(orgFiles.reduce((acc, f) => acc + f.size, 0) / 1024).toFixed(1)} KB</div>
                </div>
             </div>
             <label className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg cursor-pointer transition flex items-center gap-2 font-medium shadow-lg shadow-blue-900/20">
               <Icons.Plus size={16} /> Upload Doc
               <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.docx,.txt,.md" />
             </label>
          </div>
        </div>
        
        <div className="p-6">
          {orgFiles.length === 0 ? (
            <div className="text-gray-500 py-8 text-center border-2 border-dashed border-gray-800 rounded-xl bg-gray-950/20">
              <div className="mb-2 flex justify-center text-gray-700"><Icons.FileText size={32} /></div>
              No documents indexed. Upload a file to start.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {orgFiles.map((file) => {
                const ext = file.name.split('.').pop().toLowerCase();
                let icon = <Icons.FileText size={20} />;
                let color = "text-blue-400";
                let bg = "bg-blue-500/10";
                
                if (ext === 'pdf') { color = "text-red-400"; bg = "bg-red-500/10"; }
                else if (['doc', 'docx'].includes(ext)) { color = "text-blue-500"; bg = "bg-blue-500/10"; }
                else if (['txt', 'md'].includes(ext)) { color = "text-gray-400"; bg = "bg-gray-400/10"; }

                return (
                  <div key={file.name} className="p-4 bg-gray-950/40 border border-gray-800 rounded-xl flex flex-col justify-between hover:border-gray-600 transition group relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition">
                       <button onClick={() => handleDeleteFile(file.name)} className="text-gray-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition">
                         <Icons.Trash size={14} />
                       </button>
                    </div>
                    
                    <div className="flex items-center gap-4 mb-4">
                      <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center ${color} shadow-inner`}>
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white truncate pr-6" title={file.name}>{file.name}</div>
                        <div className="text-[10px] text-gray-500 font-mono mt-0.5 uppercase tracking-wider">{ext} · {(file.size / 1024).toFixed(1)} KB</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-[10px] text-gray-500 border-t border-gray-900 pt-3 mt-1">
                       <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                          <span>Indexed</span>
                       </div>
                       <span className="font-mono opacity-50">v1.0</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}

      {/* --- ADD SERVER MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-4">Add MCP Server</h2>
            <form onSubmit={handleAddServer} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Server Name (ID)</label>
                <input 
                  required
                  className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                  placeholder="e.g. hackernews"
                  value={newServer.name}
                  onChange={e => setNewServer({...newServer, name: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-xs text-gray-400 mb-1">Transport Type</label>
                <select 
                  className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                  value={newServer.transport}
                  onChange={e => setNewServer({...newServer, transport: e.target.value})}
                >
                  <option value="stdio">STDIO (Local Command)</option>
                  <option value="sse">SSE (Remote URL)</option>
                </select>
              </div>

              {newServer.transport === 'stdio' ? (
                <>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Command</label>
                    <input 
                      required
                      className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                      placeholder="e.g. node, python"
                      value={newServer.command}
                      onChange={e => setNewServer({...newServer, command: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Arguments</label>
                    <input 
                      className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                      placeholder="e.g. script.py"
                      value={newServer.args}
                      onChange={e => setNewServer({...newServer, args: e.target.value})}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Server URL</label>
                    <input 
                      required
                      className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                      placeholder="https://.../sse"
                      value={newServer.url}
                      onChange={e => setNewServer({...newServer, url: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Headers (JSON)</label>
                    <input 
                      className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-sm text-white focus:border-blue-500 outline-none font-mono"
                      placeholder='{"x-api-key": "..."}'
                      value={newServer.headers}
                      onChange={e => setNewServer({...newServer, headers: e.target.value})}
                    />
                    <p className="text-[10px] text-gray-500 mt-1">Optional. Required for Composio/Remote Auth.</p>
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2 rounded transition text-sm">Cancel</button>
                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded transition text-sm font-medium">Add Connection</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {activeTab === 'users' && (
      /* Users Management Panel */
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mt-8">
        <div className="p-6 border-b border-gray-800 flex justify-between items-center">
          <h2 className="font-semibold text-lg text-white">User Management</h2>
          <button onClick={fetchServersAndTasks} className="text-xs bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded transition">Refresh</button>
        </div>
        <div className="p-6 space-y-6">
          {loading ? <div className="text-gray-500">Loading...</div> :
           users.length === 0 ? <div className="text-gray-500">No registered users.</div> :
           users.map((user: any) => (
            <div key={user.id} className="border border-gray-700/50 rounded-lg overflow-hidden">
              {/* User Header */}
              <div className="flex items-center justify-between p-4 bg-gray-800/50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400 font-bold text-sm">
                    {user.username[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{user.username}</div>
                    <div className="text-xs text-gray-500">ID: {user.id} · Joined: {user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}</div>
                  </div>
                </div>
                <button onClick={() => handleDeleteUser(user.username)} className="text-gray-500 hover:text-red-400 transition p-2"><Icons.Trash /></button>
              </div>

              {/* Email Config */}
              <div className="p-4 border-t border-gray-700/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-gray-400 uppercase">📧 Email MCP Config</div>
                  {user.email_config && (
                    <button
                      onClick={() => togglePassword(user.username)}
                      title={revealedPasswords[user.username] !== undefined ? "Hide password" : "Reveal SMTP password"}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-400 transition"
                    >
                      {revealedPasswords[user.username] !== undefined ? <Icons.EyeOff /> : <Icons.Eye />}
                      <span>{revealedPasswords[user.username] !== undefined ? "Hide" : "Show"} Password</span>
                    </button>
                  )}
                </div>
                {user.email_config ? (
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="bg-gray-950 p-2 rounded"><span className="text-gray-500">Server: </span><span className="text-gray-300">{user.email_config.smtp_server}</span></div>
                    <div className="bg-gray-950 p-2 rounded"><span className="text-gray-500">Port: </span><span className="text-gray-300">{user.email_config.smtp_port}</span></div>
                    <div className="bg-gray-950 p-2 rounded"><span className="text-gray-500">From: </span><span className="text-gray-300">{user.email_config.sender_email}</span></div>
                    <div className="bg-gray-950 p-2 rounded flex items-center gap-2">
                      <span className="text-gray-500">Password: </span>
                      {revealedPasswords[user.username] !== undefined
                        ? <span className="text-yellow-300 font-mono">{revealedPasswords[user.username]}</span>
                        : <span className="text-gray-600 tracking-widest select-none">••••••••••</span>
                      }
                    </div>
                  </div>
                ) : <span className="text-xs text-gray-600 italic">No email credentials configured</span>}
              </div>

              {/* Generic Credentials */}
              <div className="p-4 border-t border-gray-700/50">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-xs font-semibold text-gray-400 uppercase">🔑 Additional Credentials</div>
                  <button
                    onClick={() => setAddCredModal({ open: true, username: user.username })}
                    className="text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 px-2 py-1 rounded flex items-center gap-1 transition"
                  >
                    <Icons.Plus /> Add
                  </button>
                </div>
                {user.credentials.length === 0 ? (
                  <span className="text-xs text-gray-600 italic">None</span>
                ) : (
                  <div className="space-y-2">
                    {user.credentials.map((cred: any) => (
                      <div key={cred.id} className="flex items-center justify-between bg-gray-950 p-2 rounded text-xs font-mono">
                        <span className="text-purple-400 font-semibold min-w-[60px]">[{cred.service_name}]</span>
                        <span className="text-gray-400 mx-2">{cred.credential_key}:</span>
                        <div className="flex-1 truncate text-gray-300">
                          {revealedCredentials[cred.id] ? cred.credential_value : "••••••••••••••••"}
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <button 
                            onClick={() => toggleCredential(cred.id)} 
                            className="text-gray-500 hover:text-blue-400 transition p-1"
                            title={revealedCredentials[cred.id] ? "Hide" : "Show"}
                          >
                            {revealedCredentials[cred.id] ? <Icons.EyeOff /> : <Icons.Eye />}
                          </button>
                          <button onClick={() => handleDeleteCred(cred.id)} className="text-gray-500 hover:text-red-400 transition p-1">
                            <Icons.Trash />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Add Credential Modal */}
      {addCredModal.open && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Add Credential for <span className="text-blue-400">{addCredModal.username}</span></h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Service / MCP Name</label>
                <input className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-sm text-white outline-none" placeholder="e.g. github, slack, openai" value={newCred.service_name} onChange={e => setNewCred({...newCred, service_name: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Credential Key</label>
                <input className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-sm text-white outline-none" placeholder="e.g. API_KEY, TOKEN" value={newCred.credential_key} onChange={e => setNewCred({...newCred, credential_key: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Credential Value</label>
                <input className="w-full bg-gray-950 border border-gray-800 rounded p-2 text-sm text-white outline-none font-mono" placeholder="sk-..." value={newCred.credential_value} onChange={e => setNewCred({...newCred, credential_value: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setAddCredModal({ open: false, username: "" })} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2 rounded text-sm">Cancel</button>
              <button onClick={handleAddCred} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-sm font-medium">Save</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function StatCard({ title, value, sub, icon, color }: any) {
  return (
    <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl">
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="text-gray-400 text-sm font-medium mb-1">{title}</div>
          <div className="text-3xl font-bold text-white tracking-tight">{value}</div>
        </div>
        <div className={`p-2 bg-gray-800 rounded-lg ${color}`}>{icon}</div>
      </div>
      {sub && <div className="text-xs text-gray-500 font-medium">{sub}</div>}
    </div>
  );
}