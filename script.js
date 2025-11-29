// CONFIGURATION
const API_URL = "https://backend-server.vibtech0.workers.dev";
let currentPath = "";
let sessionPass = null;
let currentSha = null;
let editingPath = "";

// private-space state
let privateUnlocked = false;
let hidePassCache = null;

// upload progress state
let uploadInProgress = false;
let uploadTotal = 0;
let uploadDone = 0;

// ---------- HELPERS ----------
function safeDecodeBase64(str) {
    try {
        return decodeURIComponent(escape(atob(str)));
    } catch (e) {
        return atob(str);
    }
}

function safeEncodeBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

function cleanPath(path) {
    return path.startsWith("/") ? path : "/" + path;
}

// upload progress helpers
function startUpload(totalFiles) {
    uploadInProgress = true;
    uploadTotal = totalFiles;
    uploadDone = 0;

    const bar = document.getElementById("upload-progress-fill");
    const text = document.getElementById("upload-status-text");
    bar.style.width = "0%";
    text.textContent = totalFiles > 1 ? `Uploading ${totalFiles} files...` : "Uploading file...";
    document.getElementById("upload-status").style.display = "flex";
}

function stepUpload() {
    if (!uploadInProgress || uploadTotal === 0) return;
    uploadDone++;
    const percent = Math.min(100, Math.round((uploadDone / uploadTotal) * 100));
    document.getElementById("upload-progress-fill").style.width = percent + "%";

    if (percent >= 100) {
        document.getElementById("upload-status-text").textContent = "Upload complete";
        setTimeout(() => {
            document.getElementById("upload-status").style.display = "none";
            uploadInProgress = false;
        }, 700);
    }
}

// hidepass loader
function getHidePass() {
    if (hidePassCache !== null) return Promise.resolve(hidePassCache);

    return fetch(API_URL + "/hidepass.txt", {
        headers: { "x-password": sessionPass }
    })
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
            if (data && data.content) {
                hidePassCache = safeDecodeBase64(data.content).trim();
            } else {
                hidePassCache = "";
            }
            return hidePassCache;
        })
        .catch(() => {
            hidePassCache = "";
            return hidePassCache;
        });
}

function promptPrivate(path) {
    getHidePass().then(realPass => {
        if (!realPass) {
            alert("Private password not set.");
            return;
        }
        const input = prompt("Enter private password:");
        if (input === null) return;
        if (input.trim() === realPass) {
            privateUnlocked = true;
            fetchPath(path);
        } else {
            alert("Wrong private password.");
        }
    });
}

// ---------- AUTH ----------
function attemptLogin() {
    const input = document.getElementById("pass-input");
    const btn = document.querySelector(".login-box button");
    const msg = document.getElementById("login-msg");

    const pass = input.value.trim();
    if (!pass) {
        msg.innerText = "Please enter PIN";
        return;
    }

    msg.innerText = "";
    btn.innerText = "Checking...";
    btn.disabled = true;

    fetch(API_URL + "/verify", {
        headers: { "x-password": pass }
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                sessionPass = pass;
                document.getElementById("login-overlay").style.display = "none";
                document.getElementById("app-container").style.display = "flex";
                currentPath = "";
                privateUnlocked = false;
                hidePassCache = null;
                fetchPath("");
            } else {
                msg.innerText = "Wrong Password";
                btn.innerText = "Unlock";
                btn.disabled = false;
                input.value = "";
            }
        })
        .catch(() => {
            msg.innerText = "Connection Error";
            btn.innerText = "Unlock";
            btn.disabled = false;
        });
}

function logout() {
    location.reload();
}

function switchTab(tab) {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll("section").forEach(s => (s.style.display = "none"));

    if (tab === "db") {
        document.getElementById("db-section").style.display = "block";
        document.querySelectorAll(".nav-btn")[0].classList.add("active");
        fetchPath(currentPath || "");
    } else {
        document.getElementById("feat-section").style.display = "block";
        document.querySelectorAll(".nav-btn")[1].classList.add("active");
        loadFeatures();
    }
}

// ---------- DATABASE / LISTING ----------
function fetchPath(path) {
    currentPath = path;
    const displayPath = path ? (path.length > 20 ? "..." + path.slice(-17) : path) : "/";
    document.getElementById("current-path").innerText = displayPath;
    document.getElementById("file-list").innerHTML =
        '<p style="text-align:center; color:#666; margin-top:20px;">Loading...</p>';

    const endpoint = cleanPath(path || "");

    fetch(API_URL + endpoint, {
        headers: { "x-password": sessionPass }
    })
        .then(res => res.json())
        .then(data => {
            const list = document.getElementById("file-list");
            list.innerHTML = "";

            if (currentPath !== "") {
                const parent = currentPath.split("/").slice(0, -1).join("/");
                list.innerHTML += `
                <div class="list-item" onclick="fetchPath('${parent}')">
                    <div class="item-name">
                        <i class="fas fa-level-up-alt"></i> ..
                    </div>
                </div>`;
            }

            if (data.error) {
                list.innerHTML = `<p style="text-align:center; color:red;">${data.error}</p>`;
                return;
            }

            if (!Array.isArray(data)) {
                if (data.content) {
                    fetchFile(currentPath);
                } else {
                    list.innerHTML = `<p style="text-align:center; color:red;">Unexpected response</p>`;
                }
                return;
            }

            data.sort((a, b) => (a.type === b.type ? 0 : a.type === "dir" ? -1 : 1));

            if (data.length === 0) {
                list.innerHTML = '<p style="text-align:center; color:#444; margin-top:10px;">Empty</p>';
            }

            data.forEach(item => {
                const isPrivateRoot =
                    item.type === "dir" && item.name === "private" && currentPath === "";

                const icon = item.type === "dir" ? "fa-folder" : "fa-file-code";
                let clickAction;

                if (isPrivateRoot && !privateUnlocked) {
                    clickAction = `promptPrivate('${item.path}')`;
                } else if (item.type === "dir") {
                    clickAction = `fetchPath('${item.path}')`;
                } else {
                    clickAction = `fetchFile('${item.path}')`;
                }

                let actionsHtml = "";
                if (
                    item.type !== "dir" &&
                    !item.name.includes("webpass.txt") &&
                    !item.name.includes("hidepass.txt")
                ) {
                    actionsHtml += `
                    <i class="fas fa-download"
                       onclick="event.stopPropagation(); downloadItem('${item.path}', '${item.name}')"></i>`;
                }
                if (
                    !item.name.includes("webpass.txt") &&
                    !item.name.includes("hidepass.txt")
                ) {
                    actionsHtml += `
                <i class="fas fa-trash"
                   onclick="event.stopPropagation(); deleteItem('${item.path}', '${item.sha}')"></i>`;
                }

                list.innerHTML += `
            <div class="list-item" onclick="${clickAction}">
                <div class="item-name">
                    <i class="fas ${icon}"></i> ${item.name}
                </div>
                <div class="item-actions">
                    ${actionsHtml}
                </div>
            </div>`;
            });
        })
        .catch(() => {
            document.getElementById("file-list").innerHTML =
                `<p style="text-align:center; color:red;">Connection Error</p>`;
        });
}

// ---------- FILE VIEW / DOWNLOAD ----------
function fetchFile(path) {
    if (path.includes("webpass.txt") || path.includes("hidepass.txt")) {
        location.reload();
        return;
    }

    const endpoint = cleanPath(path);

    fetch(API_URL + endpoint, {
        headers: { "x-password": sessionPass }
    })
        .then(res => res.json())
        .then(data => {
            if (!data.content) return;
            const content = safeDecodeBase64(data.content);
            openEditor(path, content, data.sha);
        });
}

function downloadItem(path, name) {
    if (path.includes("webpass.txt") || path.includes("hidepass.txt")) return;

    const endpoint = cleanPath(path);

    fetch(API_URL + endpoint, {
        headers: { "x-password": sessionPass }
    })
        .then(res => res.json())
        .then(data => {
            if (!data.content) return;

            const binaryStr = atob(data.content);
            const len = binaryStr.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }

            const blob = new Blob([bytes]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = name || path.split("/").pop();
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
}

function deleteItem(path, sha) {
    if (path.includes("webpass.txt") || path.includes("hidepass.txt")) {
        alert("You cannot delete password files.");
        return;
    }
    if (!confirm("Delete this?")) return;

    const endpoint = cleanPath(path);

    fetch(API_URL + endpoint, {
        method: "DELETE",
        headers: {
            "x-password": sessionPass,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ sha: sha })
    }).then(() => fetchPath(currentPath));
}

// ---------- FILE / FOLDER UPLOAD ----------
function handleFileUpload(input) {
    const file = input.files[0];
    if (!file) return;

    startUpload(1);

    const reader = new FileReader();
    reader.onload = function (e) {
        const content = e.target.result.split(",")[1];
        const path = currentPath ? `${currentPath}/${file.name}` : file.name;
        uploadToRepo(path, content, null, {
            onDone: stepUpload
        });
    };
    reader.readAsDataURL(file);
    input.value = "";
}

function handleFolderUpload(input) {
    const files = Array.from(input.files || []);
    if (!files.length) return;

    startUpload(files.length);
    let remaining = files.length;

    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = function (e) {
            const content = e.target.result.split(",")[1];
            const relPath = file.webkitRelativePath || file.name;
            const path = currentPath ? `${currentPath}/${relPath}` : relPath;

            uploadToRepo(path, content, null, {
                refresh: false,
                onDone: () => {
                    stepUpload();
                    remaining--;
                    if (remaining === 0) {
                        fetchPath(currentPath);
                    }
                }
            });
        };
        reader.readAsDataURL(file);
    });

    input.value = "";
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
    const path = currentPath ? `${currentPath}/${name}` : name;
    openEditor(path, "", null);
}

// Manual full-path file creation (you type code then save)
function createFileWithPathPrompt() {
    let fullPath = prompt("New File Full Path (e.g. folder/sub/file.txt):");
    if (!fullPath) return;
    fullPath = fullPath.trim();
    if (!fullPath) return;

    if (!fullPath.startsWith("/") && currentPath) {
        fullPath = currentPath + "/" + fullPath;
    }
    if (fullPath.startsWith("/")) {
        fullPath = fullPath.slice(1);
    }

    openEditor(fullPath, "", null);
}

function uploadToRepo(path, contentBase64, sha = null, options = {}) {
    const endpoint = cleanPath(path);
    const refresh = options.refresh !== false;
    const onDone = typeof options.onDone === "function" ? options.onDone : null;

    fetch(API_URL + endpoint, {
        method: "PUT",
        headers: {
            "x-password": sessionPass,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ content: contentBase64, sha: sha })
    })
        .then(res => {
            if (!res.ok) {
                alert("Upload failed.");
            }
            if (onDone) onDone();
            if (
                document.getElementById("editor-modal").style.display === "flex" &&
                options.closeEditor !== false
            ) {
                closeEditor();
            }
            if (refresh) fetchPath(currentPath);
        })
        .catch(() => {
            alert("Upload error.");
            if (onDone) onDone();
        });
}

// ---------- EDITOR ----------
function openEditor(path, content, sha) {
    editingPath = path;
    currentSha = sha;
    const name = path.split("/").pop() || path;

    document.getElementById("editor-filename").innerText = name;
    document.getElementById("code-editor").value = content;
    document.getElementById("editor-modal").style.display = "flex";
}

function closeEditor() {
    document.getElementById("editor-modal").style.display = "none";
    document.getElementById("code-editor").value = "";
    editingPath = "";
    currentSha = null;
}

function saveFile() {
    if (!editingPath) {
        alert("No file selected.");
        return;
    }
    const content = document.getElementById("code-editor").value;
    const base64Content = safeEncodeBase64(content);

    startUpload(1);
    uploadToRepo(editingPath, base64Content, currentSha, {
        onDone: stepUpload
    });
}

// ---------- FEATURES ----------
function loadFeatures() {
    fetch(API_URL + "/features", {
        headers: { "x-password": sessionPass }
    })
        .then(res => res.json())
        .then(data => {
            const list = document.getElementById("feature-list");
            list.innerHTML = "";

            if (!Array.isArray(data)) {
                list.innerHTML =
                    "<p style='grid-column: 1/-1; text-align:center;'>No features installed.</p>";
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
                list.innerHTML =
                    "<p style='grid-column: 1/-1; text-align:center;'>No features installed.</p>";
            }
        });
}

function createFeaturePrompt() {
    const name = prompt("Feature Name:");
    if (!name) return;
    const html = `<h1>${name}</h1>`;
    uploadToRepo(`features/${name}/index.html`, safeEncodeBase64(html));
}

function runFeature(name) {
    document.getElementById("feature-viewer").style.display = "flex";
    document.getElementById("feat-title").innerText = name;

    fetch(API_URL + `/features/${name}/index.html`, {
        headers: { "x-password": sessionPass }
    })
        .then(res => res.json())
        .then(data => {
            if (data.content) {
                document.getElementById("app-frame").srcdoc = safeDecodeBase64(data.content);
            }
        });
}

function closeFeature() {
    document.getElementById("feature-viewer").style.display = "none";
    document.getElementById("app-frame").srcdoc = "";
}