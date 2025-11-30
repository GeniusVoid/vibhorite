// CONFIGURATION
const API_URL = "https://secure-backend.vibtech0.workers.dev";
let currentPath = "";
let sessionPass = null;
let currentSha = null;
let editingPath = "";

// private-space state
let privateUnlocked = false;
let hidePassCache = null;
let webPassCache = null;

// upload progress state
let uploadInProgress = false;
let uploadTotal = 0;
let uploadDone = 0;

// ---------- HELPERS ----------
function safeDecodeBase64(str) {
    try { return decodeURIComponent(escape(atob(str))); }
    catch { return atob(str); }
}
function safeEncodeBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}
function cleanPath(path) {
    return path.startsWith("/") ? path : "/" + path;
}

// ---------- UPLOAD BAR ----------
function startUpload(totalFiles) {
    uploadInProgress = true;
    uploadTotal = totalFiles;
    uploadDone = 0;
    document.getElementById("upload-status").style.display = "flex";
    document.getElementById("upload-progress-fill").style.width = "0%";
    document.getElementById("upload-status-text").textContent =
        totalFiles > 1 ? `Uploading ${totalFiles} files...` : "Uploading file...";
}
function stepUpload() {
    uploadDone++;
    const percent = Math.round((uploadDone / uploadTotal) * 100);
    document.getElementById("upload-progress-fill").style.width = percent + "%";
    if (percent === 100) {
        document.getElementById("upload-status-text").textContent = "Upload complete";
        setTimeout(() => { document.getElementById("upload-status").style.display = "none"; }, 700);
    }
}

// ---------- LOAD PASSWORD FILES ----------
function getHidePass() {
    if (hidePassCache !== null) return Promise.resolve(hidePassCache);
    return fetch(API_URL + "/hidepass.txt", { headers: { "x-password": sessionPass } })
        .then(r => r.json()).then(d => {
            hidePassCache = d && d.content ? safeDecodeBase64(d.content).trim() : "";
            return hidePassCache;
        }).catch(() => "");
}
function getWebPass() {
    if (webPassCache !== null) return Promise.resolve(webPassCache);
    return fetch(API_URL + "/webpass.txt", { headers: { "x-password": sessionPass } })
        .then(r => r.json()).then(d => {
            webPassCache = d && d.content ? safeDecodeBase64(d.content).trim() : "";
            return webPassCache;
        }).catch(() => "");
}

// ---------- SECONDARY SECURITY (6-digit) ----------
async function verifyOperationPassword() {
    const [webPass, hidePass] = await Promise.all([getWebPass(), getHidePass()]);
    const first2 = webPass.slice(0, 2);
    const last2 = hidePass.slice(-2);
    const hour = String(new Date().getHours()).padStart(2, "0"); // 24-hour

    const code = first2 + hour + last2;
    const input = prompt("Enter security code:");
    return input && input.trim() === code;
}
function requireSecurity(action) {
    verifyOperationPassword().then(ok => { if (ok) action(); else alert("Wrong security code."); });
}

// ---------- PRIVATE FOLDER ----------
function promptPrivate(path) {
    getHidePass().then(real => {
        const input = prompt("Enter private folder password:");
        if (input && input.trim() === real) {
            privateUnlocked = true;
            fetchPath(path);
        } else alert("Wrong private password.");
    });
}

// ---------- LOGIN ----------
function attemptLogin() {
    const pass = document.getElementById("pass-input").value.trim();
    const msg = document.getElementById("login-msg");
    const btn = document.querySelector(".login-box button");

    if (!pass) return msg.innerText = "Please enter PIN";

    msg.innerText = "";
    btn.innerText = "Checking...";
    btn.disabled = true;

    fetch(API_URL + "/verify", { headers: { "x-password": pass } })
        .then(r => r.json()).then(d => {
            if (d.success) {
                sessionPass = pass;
                document.getElementById("login-overlay").style.display = "none";
                document.getElementById("app-container").style.display = "flex";
                fetchPath("");
            } else {
                msg.innerText = "Wrong Password";
                btn.innerText = "Unlock";
                btn.disabled = false;
            }
        }).catch(() => {
            msg.innerText = "Connection Error";
            btn.innerText = "Unlock";
            btn.disabled = false;
        });
}
function logout() { location.reload(); }

// ---------- TABS ----------
function switchTab(tab) {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll("section").forEach(s => s.style.display = "none");

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

// ---------- LIST FILES ----------
function fetchPath(path) {
    currentPath = path;
    document.getElementById("current-path").innerText = path || "/";
    document.getElementById("file-list").innerHTML =
        '<p style="text-align:center;color:#666;margin-top:20px;">Loading...</p>';

    fetch(API_URL + cleanPath(path), { headers: { "x-password": sessionPass } })
        .then(r => r.json()).then(data => {
            const list = document.getElementById("file-list");
            list.innerHTML = "";

            if (path) {
                const parent = path.split("/").slice(0, -1).join("/");
                list.innerHTML += `
                <div class="list-item" onclick="fetchPath('${parent}')">
                    <div class="item-name"><i class="fas fa-level-up-alt"></i> ..</div>
                </div>`;
            }

            if (!Array.isArray(data)) return;

            data.sort((a, b) => a.type === b.type ? 0 : a.type === "dir" ? -1 : 1);

            data.forEach(item => {
                const isPrivateRoot = item.name === "private" && !path;
                const icon = item.type === "dir" ? "fa-folder" : "fa-file-code";

                let click = item.type === "dir"
                    ? isPrivateRoot && !privateUnlocked
                        ? `promptPrivate('${item.path}')`
                        : `fetchPath('${item.path}')`
                    : `fetchFile('${item.path}')`;

                let actions = "";
                if (!item.name.includes("webpass.txt") && !item.name.includes("hidepass.txt")) {
                    if (item.type !== "dir")
                        actions += `<i class="fas fa-download" onclick="event.stopPropagation(); secureDownload('${item.path}','${item.name}')"></i>`;
                    actions += `<i class="fas fa-trash" onclick="event.stopPropagation(); secureDelete('${item.path}','${item.sha}')"></i>`;
                }

                list.innerHTML += `
                <div class="list-item" onclick="${click}">
                    <div class="item-name"><i class="fas ${icon}"></i> ${item.name}</div>
                    <div class="item-actions">${actions}</div>
                </div>`;
            });
        });
}

// ---------- FILE OPEN / SAVE ----------
function fetchFile(path) {
    if (path.includes("webpass.txt") || path.includes("hidepass.txt")) return location.reload();
    fetch(API_URL + cleanPath(path), { headers: { "x-password": sessionPass } })
        .then(r => r.json()).then(d => openEditor(path, safeDecodeBase64(d.content || ""), d.sha));
}
function openEditor(path, content, sha) {
    editingPath = path;
    currentSha = sha;
    document.getElementById("editor-filename").innerText = path.split("/").pop();
    document.getElementById("code-editor").value = content;
    document.getElementById("editor-modal").style.display = "flex";
}
function closeEditor() {
    document.getElementById("editor-modal").style.display = "none";
    document.getElementById("code-editor").value = "";
}
function saveFile() {
    requireSecurity(() => {
        startUpload(1);
        uploadToRepo(editingPath, safeEncodeBase64(document.getElementById("code-editor").value), currentSha, {
            onDone: stepUpload
        });
    });
}

// ---------- UPLOAD / DELETE / DOWNLOAD ----------
function secureDelete(path, sha) { if (confirm("Delete?")) requireSecurity(() => deleteItem(path, sha)); }
function deleteItem(path, sha) {
    fetch(API_URL + cleanPath(path), {
        method: "DELETE",
        headers: { "x-password": sessionPass, "Content-Type": "application/json" },
        body: JSON.stringify({ sha })
    }).then(() => fetchPath(currentPath));
}
function secureDownload(path, name) { requireSecurity(() => downloadItem(path, name)); }
function downloadItem(path, name) {
    fetch(API_URL + cleanPath(path), { headers: { "x-password": sessionPass } })
        .then(r => r.json()).then(d => {
            const u8 = Uint8Array.from(atob(d.content), c => c.charCodeAt(0));
            const url = URL.createObjectURL(new Blob([u8]));
            const a = Object.assign(document.createElement("a"), { href: url, download: name });
            a.click(); URL.revokeObjectURL(url);
        });
}
function uploadToRepo(path, base64, sha, opt = {}) {
    fetch(API_URL + cleanPath(path), {
        method: "PUT",
        headers: { "x-password": sessionPass, "Content-Type": "application/json" },
        body: JSON.stringify({ content: base64, sha })
    }).then(() => {
        if (opt.onDone) opt.onDone();
        if (opt.closeEditor !== false && document.getElementById("editor-modal").style.display === "flex") closeEditor();
        if (opt.refresh !== false) fetchPath(currentPath);
    });
}

// ---------- SINGLE FILE UPLOAD ----------
function handleFileUpload(input) {
    const file = input.files[0];
    input.value = "";
    requireSecurity(() => {
        startUpload(1);
        const r = new FileReader();
        r.onload = e => {
            uploadToRepo(currentPath ? `${currentPath}/${file.name}` : file.name,
                e.target.result.split(",")[1], null, { onDone: stepUpload });
        };
        r.readAsDataURL(file);
    });
}

// ---------- FOLDER UPLOAD ----------
function handleFolderUpload(input) {
    const files = [...input.files];
    input.value = "";
    requireSecurity(() => {
        startUpload(files.length);
        let left = files.length;
        files.forEach(f => {
            const r = new FileReader();
            r.onload = e => {
                const rel = f.webkitRelativePath || f.name;
                uploadToRepo(currentPath ? `${currentPath}/${rel}` : rel, e.target.result.split(",")[1], null, {
                    refresh: false,
                    onDone: () => {
                        stepUpload();
                        left--;
                        if (!left) fetchPath(currentPath);
                    }
                });
            };
            r.readAsDataURL(f);
        });
    });
}

// ---------- FOLDER / FILE CREATION ----------
function createFolderPrompt() {
    const name = prompt("Folder Name:");
    if (!name) return;
    requireSecurity(() => uploadToRepo(currentPath ? `${currentPath}/${name}/.keep` : `${name}/.keep`, safeEncodeBase64("placeholder")));
}
function createFilePrompt() {
    const name = prompt("New File Name:");
    if (!name) return;
    const path = currentPath ? `${currentPath}/${name}` : name;
    requireSecurity(() => openEditor(path, "", null));
}

// ---------- FEATURES ----------
function loadFeatures() {
    fetch(API_URL + "/features", { headers: { "x-password": sessionPass } })
        .then(r => r.json()).then(data => {
            const list = document.getElementById("feature-list");
            list.innerHTML = "";
            (data || []).forEach(item => {
                if (item.type === "dir") {
                    list.innerHTML += `
                    <div class="feature-card" onclick="runFeature('${item.name}')">
                        <div class="feature-icon"><i class="fas fa-bolt"></i></div>
                        <h3>${item.name}</h3>
                    </div>`;
                }
            });
            if (!list.innerHTML) list.innerHTML =
                "<p style='grid-column:1/-1;text-align:center;'>No features installed.</p>";
        });
}

// 🔥 FINAL VERSION — FULL SUPPORT (write + upload)
function createFeaturePrompt() {
    const name = prompt("Feature Name:");
    if (!name) return;

    requireSecurity(() => {
        const path = `features/${name}/index.html`;
        const method = prompt("Select:\n1 = Write HTML manually\n2 = Upload HTML file");
        if (!method) return;

        // Option 1: manual HTML writing
        if (method.trim() === "1") {
            openEditor(path, "", null);
            return;
        }

        // Option 2: upload html file
        if (method.trim() === "2") {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".html,text/html";
            input.onchange = e => {
                const file = e.target.files[0];
                if (!file) return;
                startUpload(1);
                const r = new FileReader();
                r.onload = x => {
                    uploadToRepo(path, x.target.result.split(",")[1], null, {
                        onDone: () => {
                            stepUpload();
                            if (document.getElementById("feat-section").style.display === "block") loadFeatures();
                        }
                    });
                };
                r.readAsDataURL(file);
            };
            input.click();
            return;
        }

        alert("Invalid choice. Enter 1 or 2.");
    });
}

// ---------- RUN FEATURE ----------
function runFeature(name) {
    document.getElementById("feature-viewer").style.display = "flex";
    document.getElementById("feat-title").innerText = name;
    fetch(API_URL + `/features/${name}/index.html`, { headers: { "x-password": sessionPass } })
        .then(r => r.json()).then(d => {
            document.getElementById("app-frame").srcdoc = safeDecodeBase64(d.content || "");
        });
}
function closeFeature() {
    document.getElementById("feature-viewer").style.display = "none";
    document.getElementById("app-frame").srcdoc = "";
}