// ====== Config & storage ======
const LS_KEY = "gitmcpHistory_v1"; // { workspaces: { [name]: Entry[] }, current: string }
const DEFAULT_WS = "General";

function loadState() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) {
    const state = { workspaces: { [DEFAULT_WS]: [] }, current: DEFAULT_WS };
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    return state;
  }
  try { return JSON.parse(raw); } catch {
    const state = { workspaces: { [DEFAULT_WS]: [] }, current: DEFAULT_WS };
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    return state;
  }
}
function saveState(state){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }

let state = loadState();

// ====== DOM ======
const workspaceSelect = document.getElementById("workspaceSelect");
const newWorkspaceInput = document.getElementById("newWorkspaceInput");
const addWorkspaceBtn = document.getElementById("addWorkspaceBtn");
const deleteWorkspaceBtn = document.getElementById("deleteWorkspaceBtn");

const inputUrl = document.getElementById("inputUrl");
const pasteBtn = document.getElementById("pasteBtn");
const convertBtn = document.getElementById("convertBtn");
const spinner = document.getElementById("spinner");

const result = document.getElementById("result");
const outputUrl = document.getElementById("outputUrl");
const copyBtn = document.getElementById("copyBtn");
const openBtn = document.getElementById("openBtn");
const validation = document.getElementById("validationMessage");

const exportBtn = document.getElementById("exportBtn");
const importInput = document.getElementById("importInput");
const clearWorkspaceBtn = document.getElementById("clearWorkspaceBtn");
const historyList = document.getElementById("historyList");

// ====== Utilitaires ======
function isValidGitHubUrl(url) {
  try {
    const u = new URL(url);
    const host = u.host.toLowerCase();
    return host === "github.com" || host.endsWith(".github.io");
  } catch { return false; }
}

function convertGitHubToMCP(url) {
  if (url.includes("github.com/")) {
    return url.replace(/^https?:\/\/github\.com/i, "https://gitmcp.io");
  }
  if (url.match(/^https?:\/\/([a-z0-9-]+)\.github\.io/i)) {
    return url.replace(".github.io", ".gitmcp.io");
  }
  throw new Error("Format d'URL non reconnu");
}

function uuid(){
  return (crypto.randomUUID && crypto.randomUUID()) ||
    "id-"+Math.random().toString(36).slice(2)+Date.now().toString(36);
}

function fmtDate(ts){
  const d = new Date(ts);
  return d.toLocaleString();
}

function setValidation(msg, ok=false){
  validation.textContent = msg || "";
  validation.style.color = ok ? "var(--green)" : "var(--muted)";
}

// ====== Workspaces ======
function refreshWorkspaceSelect(){
  workspaceSelect.innerHTML = "";
  Object.keys(state.workspaces).forEach(name=>{
    const opt = document.createElement("option");
    opt.value = name; opt.textContent = name;
    if (name === state.current) opt.selected = true;
    workspaceSelect.appendChild(opt);
  });
}
function ensureWorkspace(name){
  if (!state.workspaces[name]) state.workspaces[name] = [];
}
function switchWorkspace(name){
  ensureWorkspace(name);
  state.current = name;
  saveState(state);
  refreshWorkspaceSelect();
  renderHistory();
  setValidation(`Dossier actif : "${name}"`, true);
}

addWorkspaceBtn.addEventListener("click", ()=>{
  const name = newWorkspaceInput.value.trim();
  if (!name) { setValidation("Nom de dossier requis."); return; }
  if (state.workspaces[name]) { setValidation("Ce dossier existe déjà."); return; }
  state.workspaces[name] = [];
  switchWorkspace(name);
  newWorkspaceInput.value = "";
});

deleteWorkspaceBtn.addEventListener("click", ()=>{
  const name = state.current;
  if (name === DEFAULT_WS) { setValidation("Le dossier par défaut ne peut pas être supprimé."); return; }
  if (!confirm(`Supprimer le dossier "${name}" et son historique ?`)) return;
  delete state.workspaces[name];
  switchWorkspace(DEFAULT_WS);
});

workspaceSelect.addEventListener("change", (e)=> switchWorkspace(e.target.value));

// ====== Conversion ======
async function doConvert(){
  const url = inputUrl.value.trim();
  result.classList.add("hidden");
  setValidation("");

  if (!url) { setValidation("Fournis une URL GitHub."); return; }
  if (!isValidGitHubUrl(url)) { setValidation("URL non reconnue (github.com ou *.github.io)."); return; }

  spinner.classList.remove("hidden");
  await new Promise(r=>setTimeout(r, 180)); // micro-delai pour montrer le spinner

  try {
    const mcp = convertGitHubToMCP(url);
    outputUrl.value = mcp;
    openBtn.href = mcp;
    result.classList.remove("hidden");
    setValidation("Conversion réussie ✔︎", true);

    // Enregistrer dans l'historique
    const entry = {
      id: uuid(),
      ts: Date.now(),
      inputUrl: url,
      outputUrl: mcp
    };
    const ws = state.current;
    state.workspaces[ws].unshift(entry);
    // dédup (par outputUrl) récente d'abord
    const seen = new Set();
    state.workspaces[ws] = state.workspaces[ws].filter(e=>{
      const key = e.outputUrl;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, 200); // borne
    saveState(state);
    renderHistory();

  } catch (e) {
    setValidation(e.message || "Erreur de conversion.");
  } finally {
    spinner.classList.add("hidden");
  }
}

convertBtn.addEventListener("click", doConvert);
inputUrl.addEventListener("keydown", (e)=>{ if(e.key==="Enter") doConvert(); });

// ====== Presse-papiers ======
pasteBtn.addEventListener("click", async ()=>{
  try{
    if (!navigator.clipboard || !window.isSecureContext) {
      setValidation("Le collage nécessite HTTPS ou localhost.");
      return;
    }
    const text = await navigator.clipboard.readText();
    inputUrl.value = text.trim();
    setValidation("Collé depuis le presse-papiers.", true);
  }catch{
    setValidation("Impossible de lire le presse-papiers (permissions).");
  }
});

copyBtn.addEventListener("click", async ()=>{
  try{
    await navigator.clipboard.writeText(outputUrl.value);
    setValidation("URL MCP copiée ✔︎", true);
  }catch{
    setValidation("Impossible de copier (permissions).");
  }
});

// ====== Historique UI ======
function renderHistory(){
  const ws = state.current;
  const items = state.workspaces[ws] || [];
  historyList.innerHTML = "";
  if (!items.length){
    historyList.innerHTML = `<li class="meta">Aucune entrée dans ce dossier.</li>`;
    return;
  }
  for (const e of items){
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="col">
        <div><strong>Entrée :</strong> <code title="${e.inputUrl}">${truncate(e.inputUrl, 90)}</code></div>
        <div><strong>MCP :</strong> <a href="${e.outputUrl}" target="_blank" rel="noopener"><code>${e.outputUrl}</code></a></div>
        <div class="meta">${fmtDate(e.ts)}</div>
      </div>
      <div class="row">
        <button class="secondary" data-action="copy" data-id="${e.id}">Copier MCP</button>
        <button class="danger" data-action="del" data-id="${e.id}">Supprimer</button>
      </div>
    `;
    historyList.appendChild(li);
  }
}

function truncate(s, n){ return s.length > n ? s.slice(0, n-1)+"…" : s; }

historyList.addEventListener("click", async (e)=>{
  const btn = e.target.closest("button"); if(!btn) return;
  const id = btn.dataset.id; const action = btn.dataset.action;
  const ws = state.current;
  const arr = state.workspaces[ws] || [];
  const idx = arr.findIndex(x=>x.id===id);
  if (idx<0) return;
  if (action==="del"){ 
    arr.splice(idx,1); saveState(state); renderHistory();
  } else if (action==="copy"){
    try {
      await navigator.clipboard.writeText(arr[idx].outputUrl);
      setValidation("MCP copiée depuis l'historique ✔︎", true);
    } catch {
      setValidation("Impossible de copier (permissions).");
    }
  }
});

clearWorkspaceBtn.addEventListener("click", ()=>{
  const ws = state.current;
  if (!confirm(`Vider complètement l'historique du dossier "${ws}" ?`)) return;
  state.workspaces[ws] = [];
  saveState(state); renderHistory();
});

// ====== Export / Import JSON ======
exportBtn.addEventListener("click", ()=>{
  const ws = state.current;
  const data = {
    version: 1,
    workspace: ws,
    entries: state.workspaces[ws] || []
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const safe = ws.replace(/[^a-z0-9-_]/gi, "_");
  a.download = `gitmcp-history-${safe}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setValidation("Export JSON prêt.", true);
});

importInput.addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  if(!file) return;
  try{
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || typeof data !== "object") throw new Error("Fichier invalide.");
    const ws = data.workspace || state.current;
    ensureWorkspace(ws);
    const merged = [...(state.workspaces[ws]||[]), ...(data.entries||[])];
    // dédup par id puis par outputUrl
    const byId = new Map();
    for (const it of merged){
      const key = it.id || uuid();
      const obj = { id:key, ts: it.ts || Date.now(), inputUrl: it.inputUrl, outputUrl: it.outputUrl };
      byId.set(key, obj);
    }
    // seconde passe pour dédup outputUrl
    const seen = new Set(); const final = [];
    [...byId.values()].sort((a,b)=>b.ts-a.ts).forEach(it=>{
      if (seen.has(it.outputUrl)) return; seen.add(it.outputUrl); final.push(it);
    });
    state.workspaces[ws] = final.slice(0, 200);
    state.current = ws;
    saveState(state);
    refreshWorkspaceSelect(); renderHistory();
    setValidation(`Import OK → dossier "${ws}"`, true);
  }catch(err){
    setValidation("Import échoué : " + (err.message || "inconnu"));
  }finally{
    importInput.value = "";
  }
});

// ====== init ======
function init(){
  // bootstrap
  Object.keys(state.workspaces).length || (state.workspaces[DEFAULT_WS]=[]);
  ensureWorkspace(state.current || DEFAULT_WS);
  refreshWorkspaceSelect();
  renderHistory();
}
init();
