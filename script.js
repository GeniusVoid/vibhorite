// CONFIGURATION
const API_URL = "https://backend-server.vibtech0.workers.dev";
let currentPath = "";
let sessionPass = null;
let currentSha = null; // For editing

// --- AUTHENTICATION ---
function attemptLogin() {
    const pass = document.getElementById('pass-input').value;
    if (!pass) return;
    
    const msg = document.getElementById('login-msg');
    msg.innerText = "Verifying...";
    
    fetch(API_URL + "/verify", {
        headers: { "x-password": pass }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            sessionPass = pass;
            document.getElementById('login-overlay').style.display = "none";
            document.getElementById('app-container').style.display = "flex";
            fetchPath(''); // Load root
        } else {
            msg.innerText = "Access Denied";
            document.getElementById('pass-input').value = "";
        }
    })
    .catch(err => msg.innerText = "Connection Error. Check Backend.");
}

function logout() {
    location.reload();
}

// --- NAVIGATION ---
function switchTab(tab) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    
    if (tab === 'db') {
        document.getElementById('db-section').style.display = 'block';
        // Re-target the active class safely
        const btn = document.querySelector(`button[onclick="switchTab('db')"]`);
        if(btn) btn.classList.add('active');
        fetchPath(currentPath || '');
    } else {
        document.getElementById('feat-section').style.display = 'block';
        const btn = document.querySelector(`button[onclick="switchTab('feat')"]`);
        if(btn) btn.classList.add('active');
        loadFeatures();
    }
}

// --- DATABASE LOGIC ---
function fetchPath(path) {
    currentPath = path;
    const displayPath = path ? (path.length > 20 ? '...'+path.slice(-17) : path) : '/';
    document.getElementById('current-path').innerText = displayPath;
    document.getElementById('file-list').innerHTML = '<p style="text-align:center; color:#666; margin-top:20px;">Loading...</p>';

    // Fix path formatting for API
    let endpoint = path.startsWith('/') ? path : '/' + path;

    fetch(API_URL + endpoint, {
        headers: { "x-password": sessionPass }
    })
    .then(res => res.json())
    .then(data => {
        const list = document.getElementById('file-list');
        list.innerHTML = "";
        
        if (path !== "") {
            const parent = path.split('/').slice(0, -1).join('/');
            list.innerHTML += `<div class="list-item" onclick="fetchPath('${parent}')"><div class="item-name"><i class="fas fa-level-up-alt"></i> ..</div></div>`;
        }

        // Handle if it's a file (editor) or folder (list)
        if (!Array.isArray(data)) {
            if(data.content) {
               openEditor(data.name, atob(data.content), data.sha);
               // Go back one step in view so we don't get stuck
               const parent = path.split('/').slice(0, -1).join('/');
               currentPath = parent;
               document.getElementById('current-path').innerText = parent || '/';
            }
            return;
        }

        // Sort: Folders first, then files
        data.sort((a, b) => (a.type === b.type ? 0 : a.type === 'dir' ? -1 : 1));

        data.forEach(item => {
            const icon = item.type === "dir" ? "fa-folder" : "fa-file-code";
            const clickAction = item.type === "dir" 
                ? `fetchPath('${item.path}')` 
                : `fetchFile('${item.path}')`;
            
            const deleteBtn = `<i class="fas fa-trash" onclick="event.stopPropagation(); deleteItem('${item.path}', '${item.sha}')"></i>`;

            list.innerHTML += `
            <div class="list-item" onclick="${clickAction}">
                <div class="item-name"><i class="fas ${icon}"></i> ${item.name}</div>
                <div class="item-actions">${deleteBtn}</div>
            </div>`;
        });
    })
    .catch(err => {
        console.error(err);
        document.getElementById('file-list').innerHTML = '<p style="text-align:center; color:red;">Error fetching data.</p>';
    });
}

function fetchFile(path) {
    fetch(API_URL + "/" + path, { headers: { "x-password": sessionPass } })
    .then(res => res.json())
    .then(data => {
        openEditor(data.name, atob(data.content), data.sha);
    });
}

function deleteItem(path, sha) {
    if(!confirm("Are you sure you want to delete this?")) return;
    fetch(API_URL + "/" + path, {
        method: "DELETE",
        headers: { 
            "x-password": sessionPass,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ sha: sha })
    }).then(() => fetchPath(currentPath));
}

// --- UPLOAD / CREATE ---
function handleFileUpload(input) {
    const file = input.files[0];
    if (!file) return;
    
    // Simple reader for text/code. For images, we need better base64 handling (future update)
    const reader = new FileReader();
    reader.onload = function(e) {
        // e.target.result is like "data:text/html;base64,....."
        const content = e.target.result.split(',')[1]; 
        const path = currentPath ? `${currentPath}/${file.name}` : file.name;
        
        uploadToRepo(path, content);
    };
    reader.readAsDataURL(file);
    input.value = ''; // Reset input
}

function createFolderPrompt() {
    const name = prompt("Folder Name:");
    if (!name) return;
    const path = currentPath ? `${currentPath}/${name}/.keep` : `${name}/.keep`;
    uploadToRepo(path, btoa("placeholder"));
}

function uploadToRepo(path, contentBase64, sha=null) {
    fetch(API_URL + "/" + path, {
        method: "PUT",
        headers: { 
            "x-password": sessionPass,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ content: contentBase64, sha: sha })
    }).then(res => {
        if(res.ok) {
            if (document.getElementById('editor-modal').style.display === 'flex') closeEditor();
            fetchPath(currentPath);
        } else {
            alert("Upload failed.");
        }
    });
}

// --- EDITOR ---
let editingPath = "";
function openEditor(name, content, sha) {
    editingPath = currentPath ? `${currentPath}/${name}` : name;
    currentSha = sha;
    document.getElementById('editor-filename').innerText = name;
    document.getElementById('code-editor').value = content;
    document.getElementById('editor-modal').style.display = 'flex';
}

function closeEditor() {
    document.getElementById('editor-modal').style.display = 'none';
    document.getElementById('code-editor').value = "";
}

function saveFile() {
    const content = document.getElementById('code-editor').value;
    // We assume UTF-8 text for now.
    // btoa fails on unicode characters so we need a wrapper if using emojis
    const base64Content = btoa(unescape(encodeURIComponent(content))); 
    uploadToRepo(editingPath, base64Content, currentSha);
}

// --- FEATURES SYSTEM ---
function loadFeatures() {
    fetch(API_URL + "/features", { headers: { "x-password": sessionPass } })
    .then(res => res.json())
    .then(data => {
        const list = document.getElementById('feature-list');
        list.innerHTML = "";
        
        if (!Array.isArray(data)) {
            // Check if 404 (folder doesn't exist)
            list.innerHTML = "<p style='grid-column: 1/-1; text-align:center;'>No 'features' folder found.<br>Create one in Database to start.</p>";
            return;
        }
        
        data.forEach(item => {
            if(item.type === "dir") {
                list.innerHTML += `
                <div class="feature-card" onclick="runFeature('${item.name}')">
                    <div class="feature-icon"><i class="fas fa-bolt"></i></div>
                    <h3>${item.name}</h3>
                </div>`;
            }
        });
    });
}

function createFeaturePrompt() {
    const name = prompt("Feature Name (e.g., calc):");
    if (!name) return;
    
    // Basic template
    const html = `
<!DOCTYPE html>
<html>
<head>
<style>
  body{background:#fff; color:#000; font-family:sans-serif; padding:20px; text-align:center;}
  button{padding:10px 20px; background:blue; color:white; border:none; border-radius:5px;}
</style>
</head>
<body>
  <h1>${name}</h1>
  <p>Welcome to your new feature!</p>
  <button onclick="alert('It works!')">Test Me</button>
</body>
</html>`;
    
    // encode
    const b64 = btoa(html);
    const path = `features/${name}/index.html`;
    uploadToRepo(path, b64);
}

function runFeature(name) {
    document.getElementById('feature-viewer').style.display = "flex";
    document.getElementById('feat-title').innerText = name;
    const frame = document.getElementById('app-frame');
    frame.srcdoc = "<h3 style='font-family:sans-serif;text-align:center;margin-top:20px;'>Loading Feature...</h3>";

    fetch(API_URL + `/features/${name}/index.html`, { headers: { "x-password": sessionPass } })
    .then(res => res.json())
    .then(data => {
        if(data.content) {
            const htmlContent = atob(data.content);
            frame.srcdoc = htmlContent;
        } else {
            frame.srcdoc = "Error: index.html not found in this feature folder.";
        }
    });
}

function closeFeature() {
    document.getElementById('feature-viewer').style.display = "none";
    document.getElementById('app-frame').srcdoc = "";
}
