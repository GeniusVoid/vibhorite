// CONFIGURATION
const API_URL = "https://backend-server.vibtech0.workers.dev";
let currentPath = "";
let sessionPass = null;
let currentSha = null;
let editingPath = "";

// ---------- HELPERS ----------
function safeDecodeBase64(str) {
    try {
        // for UTF-8 text
        return decodeURIComponent(escape(atob(str)));
    } catch (e) {
        // fallback for plain ASCII
        return atob(str);
    }
}

function safeEncodeBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

// ---------- AUTHENTICATION ----------
async function attemptLogin() {
    const input = document.getElementById('pass-input');
    const btn = document.querySelector('.login-box button');
    const msg = document.getElementById('login-msg');

    const pass = input.value.trim();
    if (!pass) {
        msg.innerText = "Please enter PIN";
        return;
    }

    msg.innerText = "";
    btn.innerText = "Checking...";
    btn.disabled = true;

    try {
        const res = await fetch(API_URL + "/verify", {
            headers: { "x-password": pass }
        });

        const raw = await res.text();

        // DEBUG POPUP ON PHONE – shows what backend really sends
        alert("VERIFY\nStatus: " + res.status + "\n\nResponse:\n" + raw);

        let data;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            msg.innerText = "Backend not sending JSON";
            btn.innerText = "Unlock";
            btn.disabled = false;
            return;
        }

        if (data.success) {
            sessionPass = pass;
            document.getElementById('login-overlay').style.display = "none";
            document.getElementById('app-container').style.display = "flex";
            fetchPath('');
        } else {
            msg.innerText = "Wrong Password (server said false)";
            btn.innerText = "Unlock";
            btn.disabled = false;
            input.value = "";
        }
    } catch (err) {
        alert("VERIFY fetch error:\n" + err);
        msg.innerText = "Connection Error";
        btn.innerText = "Unlock";
        btn.disabled = false;
    }
}

function logout() {
    location.reload();
}

function switchTab(tab) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    
    if (tab === 'db') {
        document.getElementById('db-section').style.display = 'block';
        document.querySelectorAll('.nav-btn')[0].classList.add('active');
        fetchPath(currentPath || '');
    } else {
        document.getElementById('feat-section').style.display = 'block';
        document.querySelectorAll('.nav-btn')[1].classList.add('active');
        loadFeatures();
    }
}

// ---------- DATABASE LOGIC ----------
function fetchPath(path) {
    currentPath = path;
    const displayPath = path ? (path.length > 20 ? '...' + path.slice(-17) : path) : '/';
    document.getElementById('current-path').innerText = displayPath;
    document.getElementById('file-list').innerHTML = '<p style="text-align:center; color:#666; margin-top:20px;">Loading...</p>';

    const endpoint = path.startsWith('/') ? path : '/' + path;

    fetch(API_URL + endpoint, {
        headers: { "x-password": sessionPass }
    })
    .then(res => res.text())
    .then(raw => {
        let data;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            document.getElementById('file-list').innerHTML =
                `<p style="text-align:center; color:red;">Invalid JSON from backend</p>`;
            // debug popup
            alert("LIST PATH ERROR\nResponse was not JSON:\n" + raw);
            return;
        }

        const list = document.getElementById('file-list');
        list.innerHTML = "";
        
        if (currentPath !== "") {
            const parent = currentPath.split('/').slice(0, -1).join('/');
            list.innerHTML += `
                <div class="list-item" onclick="fetchPath('${parent}')">
                    <div class="item-name"><i class="fas fa-level-up-alt"></i> ..</div>
                </div>`;
        }

        if (data.error) {
            list.innerHTML = `<p style="text-align:center; color:red;">${data.error}</p>`;
            return;
        }

        // File vs directory response
        if (!Array.isArray(data)) {
            if (data.content) {
                fetchFile(currentPath);  // delegate to file loader
            } else {
                list.innerHTML = `<p style="text-align:center; color:red;">Unexpected response</p>`;
                alert("Unexpected LIST response:\n" + raw);
            }
            return;
        }

        data.sort((a, b) => (a.type === b.type ? 0 : a.type === 'dir' ? -1 : 1));

        if (data.length === 0) {
            list.innerHTML += '<p style="text-align:center; color:#444; margin-top:10px;">Empty</p>';
        }

        data.forEach(item => {
            const icon = item.type === "dir" ? "fa-folder" : "fa-file-code";
            const clickAction = item.type === "dir"
                ? `fetchPath('${item.path}')`
                : `fetchFile('${item.path}')`;
            
            list.innerHTML += `
            <div class="list-item" onclick="${clickAction}">
                <div class="item-name"><i class="fas ${icon}"></i> ${item.name}</div>
                <div class="item-actions">
                    <i class="fas fa-trash" onclick="event.stopPropagation(); deleteItem('${item.path}', '${item.sha}')"></i>
                </div>
            </div>`;
        });
    })
    .catch(err => {
        document.getElementById('file-list').innerHTML =
            `<p style="text-align:center; color:red;">Connection Error</p>`;
        alert("LIST PATH fetch error:\n" + err);
    });
}

function fetchFile(path) {
    // trap for password file
    if (path.includes('webpass.txt')) {
        location.reload();
        return;
    }

    const cleanPath = path.startsWith('/') ? path : '/' + path;

    fetch(API_URL + cleanPath, {
        headers: { "x-password": sessionPass }
    })
    .then(res => res.text())
    .then(raw => {
        let data;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            alert("FILE RESPONSE NOT JSON:\n" + raw);
            return;
        }

        if (!data.content) {
            alert("FILE LOAD ERROR:\n" + (data.error || "No content field"));
            return;
        }

        const content = safeDecodeBase64(data.content);
        openEditor(data.name, content, data.sha);
    })
    .catch(err => {
        alert("FILE fetch error:\n" + err);
    });
}

function deleteItem(path, sha) {
    if (path.includes('webpass.txt')) {
        alert("You cannot delete the password file.");
        return;
    }
    if (!confirm("Delete this?")) return;

    const cleanPath = path.startsWith('/') ? path : '/' + path;

    fetch(API_URL + cleanPath, {
        method: "DELETE",
        headers: {
            "x-password": sessionPass,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ sha: sha })
    })
    .then(res => {
        if (!res.ok) {
            alert("Delete failed with status " + res.status);
        }
        fetchPath(currentPath);
    })
    .catch(err => {
        alert("DELETE fetch error:\n" + err);
    });
}

// ---------- FILE OPERATIONS ----------
function handleFileUpload(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result.split(',')[1];
        const path = currentPath ? `${currentPath}/${file.name}` : file.name;
        uploadToRepo(path, content);
    };
    reader.readAsDataURL(file);
    input.value = '';
}

function createFolderPrompt() {
    const name = prompt("Folder Name:");
    if (!name) return;
    const path = currentPath ? `${currentPath}/${name}/.keep` : `${name}/.keep`;
    uploadToRepo(path, safeEncodeBase64("placeholder"));
}

function createFilePrompt() {
    const name = prompt("New File Name (e.g. notes.txt):");
    if (!name) return;
    openEditor(name, "", null);
}

function uploadToRepo(path, contentBase64, sha = null) {
    const cleanPath = path.startsWith('/') ? path : '/' + path;

    fetch(API_URL + cleanPath, {
        method: "PUT",
        headers: {
            "x-password": sessionPass,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ content: contentBase64, sha: sha })
    })
    .then(res => res.text())
    .then(raw => {
        // optional debug
        // alert("UPLOAD RESPONSE:\n" + raw);
        if (document.getElementById('editor-modal').style.display === 'flex') {
            closeEditor();
        }
        fetchPath(currentPath);
    })
    .catch(err => {
        alert("UPLOAD fetch error:\n" + err);
    });
}

// ---------- EDITOR ----------
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
    editingPath = "";
    currentSha = null;
}

function saveFile() {
    if (!editingPath) {
        alert("No file path set.");
        return;
    }
    const content = document.getElementById('code-editor').value;
    const base64Content = safeEncodeBase64(content);
    uploadToRepo(editingPath, base64Content, currentSha);
}

// ---------- FEATURES ----------
function loadFeatures() {
    fetch(API_URL + "/features", {
        headers: { "x-password": sessionPass }
    })
    .then(res => res.text())
    .then(raw => {
        let data;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            alert("FEATURE LIST NOT JSON:\n" + raw);
            return;
        }

        const list = document.getElementById('feature-list');
        list.innerHTML = "";

        if (!Array.isArray(data)) {
            list.innerHTML = "<p style='grid-column: 1/-1; text-align:center;'>No features installed.</p>";
            return;
        }

        data.forEach(item => {
            if (item.type === "dir") {
                list.innerHTML += `
                <div class="feature-card" onclick="runFeature('${item.name}')">
                    <div class="feature-icon"><i class="fas fa-bolt"></i></div>
                    <h3>${item.name}</h3>
                </div>`;
            }
        });

        if (!list.innerHTML) {
            list.innerHTML = "<p style='grid-column: 1/-1; text-align:center;'>No features installed.</p>";
        }
    })
    .catch(err => {
        alert("FEATURE LIST fetch error:\n" + err);
    });
}

function createFeaturePrompt() {
    const name = prompt("Feature Name:");
    if (!name) return;
    const html = `<h1>${name}</h1>`;
    uploadToRepo(`features/${name}/index.html`, safeEncodeBase64(html));
}

function runFeature(name) {
    document.getElementById('feature-viewer').style.display = "flex";
    document.getElementById('feat-title').innerText = name;

    fetch(API_URL + `/features/${name}/index.html`, {
        headers: { "x-password": sessionPass }
    })
    .then(res => res.text())
    .then(raw => {
        let data;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            alert("FEATURE FILE NOT JSON:\n" + raw);
            return;
        }
        if (data.content) {
            document.getElementById('app-frame').srcdoc = safeDecodeBase64(data.content);
        } else {
            alert("Feature has no content.");
        }
    })
    .catch(err => {
        alert("FEATURE fetch error:\n" + err);
    });
}

function closeFeature() {
    document.getElementById('feature-viewer').style.display = "none";
    document.getElementById('app-frame').srcdoc = "";
}