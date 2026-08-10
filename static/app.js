const socket = typeof io !== "undefined" ? io() : null;
let debugLines = [];
let sshSessionId = null;
let currentApps = [];
let appsPage = 1;
const APPS_PAGE_SIZE = 5;

window.onerror = function (message, source, lineno, colno, error) {
  const errText = `JS_ERROR: ${message} at line ${lineno}:${colno}`;
  console.error(errText, error);
  toast(errText);
  debugLog(errText);
  const tabServer = document.getElementById("tabServer");
  if (tabServer) tabServer.onclick();
};

function debugLog(line) {
  const ts = new Date().toLocaleTimeString();
  debugLines.push(`[${ts}] ${line}`);
  if (debugLines.length > 120) debugLines = debugLines.slice(-120);
  const box = document.getElementById("debugConsole");
  if (!box) return;
  box.textContent = debugLines.join("\n");
  box.scrollTop = box.scrollHeight;
}

function toast(message) {
  const box = document.getElementById("toast");
  if (!box) return;
  box.textContent = message;
  box.style.display = "block";
  setTimeout(() => {
    box.style.display = "none";
  }, 4500);
}

async function api(path, options = {}) {
  const res = await fetch(path, options);
  return res.json();
}

function getPage() {
  const p = window.location.pathname;
  if (p === "/devices") return "devices";
  if (p === "/apps") return "apps";
  return "dashboard";
}

async function getDevices() {
  return api("/api/devices");
}

function actionButton(label, onClick) {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.onclick = onClick;
  return btn;
}

function renderIframe(container, src) {
  const iframe = document.createElement("iframe");
  iframe.src = src;
  container.appendChild(iframe);
}

async function connectDevice(device) {
  const out = await api(`/api/devices/${device.id}/connect`, { method: "POST" });
  toast(out.message || "Done");
}

async function uploadToDevice(device) {
  const picker = document.createElement("input");
  picker.type = "file";
  picker.onchange = async () => {
    if (!picker.files.length) return;
    const fd = new FormData();
    fd.append("device_id", device.id);
    fd.append("remote_path", "/sdcard/Download/");
    fd.append("file", picker.files[0]);
    const out = await fetch("/api/upload", { method: "POST", body: fd }).then((r) => r.json());
    toast(out.message || "Upload complete");
  };
  picker.click();
}

async function installAppToDevice(device) {
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = ".apk,application/vnd.android.package-archive";
  picker.onchange = async () => {
    if (!picker.files.length) return;
    const file = picker.files[0];
    const fd = new FormData();
    fd.append("device_id", device.id);
    fd.append("file", file);
    const out = await fetch("/api/install-apk", { method: "POST", body: fd }).then((r) => r.json());
    toast(out.message || "Install action completed");
    debugLog(`install_apk: ${out.message || "completed"}`);
  };
  picker.click();
}

async function installIpaToDevice(device) {
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = ".ipa,application/octet-stream";
  picker.onchange = async () => {
    if (!picker.files.length) return;
    const file = picker.files[0];
    const fd = new FormData();
    fd.append("device_id", device.id);
    fd.append("file", file);
    const out = await fetch("/api/install-ipa", { method: "POST", body: fd }).then((r) => r.json());
    toast(out.message || "IPA install action completed");
    debugLog(`install_ipa: ${out.message || "completed"}`);
  };
  picker.click();
}

function attachSocketListeners() {
  if (!socket) return;
  socket.on("http_server_status", (d) => {
    toast(d.message || "HTTP server action completed");
    debugLog(`HTTP server: ${d.message || "completed"}`);
    if (d.attempts && d.attempts.length) {
      d.attempts.forEach((a) => debugLog(`attempt -> ${a}`));
    }
    if (d.hints && d.hints.length) {
      d.hints.forEach((h) => debugLog(`hint -> ${h}`));
    }
  });
  socket.on("frida_server_status", (d) => toast(d.message || "Frida action completed"));
  socket.on("objection_status", (d) => toast(d.message || "Objection action done"));
  socket.on("ssl_bypass_status", (d) => toast(d.command || d.message || "Command ready"));
  socket.on("debug_log", (d) => {
    debugLog(`${d.source || "log"}: ${d.message || ""}`);
  });
  socket.on("debug_http_server_status", (d) => {
    if (d.status !== "success") {
      debugLog(`HTTP debug failed: ${d.message || "unknown error"}`);
      toast(d.message || "HTTP debug failed");
      return;
    }
    const checks = d.checks || [];
    if (!checks.length) {
      debugLog("HTTP debug returned no checks.");
      return;
    }
    debugLog("HTTP debug checks:");
    checks.forEach((item) => {
      const status = item.ok ? "OK" : "FAIL";
      debugLog(`${status} ${item.check}: ${item.output || "(no output)"}`);
    });
  });
  socket.on("app_list", (payload) => {
    if (getPage() !== "apps") return;
    renderApps(payload.apps || []);
  });
  socket.on("frida_script_status", (d) => toast(d.message || "Frida script status update"));
  socket.on("logcat_status", (d) => toast(d.message || "Logcat status update"));
  socket.on("logcat_line", (d) => {
    const box = document.getElementById("logcatOutput");
    if (box) {
      box.textContent += d.line + "\n";
      box.scrollTop = box.scrollHeight;
    }
  });
}

function getPlatformIcon(type, size = 13) {
  if (type === "ios") {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 0.92-2.85-.9.04-1.99.6-2.63 1.35-.57.65-1.06 1.71-.93 2.73 1.01.08 2.02-.48 2.64-1.23"/></svg>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor"><path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.997-3.459c.125-.2164.051-.4972-.165-.6222-.216-.125-.497-.051-.622.165l-2.023 3.504C15.421 8.358 13.766 8 12 8s-3.421.358-5.068.909L4.909 5.405c-.125-.216-.406-.29-.622-.165-.216.125-.29.4058-.165.6222l1.997 3.459C2.688 11.171 0 14.887 0 19.25h24c0-4.363-2.688-8.079-6.1185-9.9286"/></svg>`;
}

async function renderDashboard() {
  const cards = document.getElementById("deviceCards");
  if (!cards) return;

  let filter = "all";
  const devices = await getDevices();

  const rerender = () => {
    cards.innerHTML = "";
    const filtered = devices.filter((d) => filter === "all" || d.type === filter);
    if (!filtered.length) {
      cards.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><p>No matching devices found.</p></div>`;
      return;
    }
    filtered.forEach((device) => {
      const card = document.createElement("div");
      const cardClass = device.type === "ios" ? "ios" : "android";
      const badgeClass = device.type === "ios" ? "badge-ios" : "badge-android";
      const badgeLabel = device.type === "ios" ? "iOS" : "Android";
      const isUsbSerial = !device.ip.includes(".") && !device.ip.includes(":");
      const ipLabelText = isUsbSerial ? "USB SERIAL" : "IP ADDRESS";
      const desc = device.description ? `<div class="device-card-desc">${device.description}</div>` : "";

      card.className = `device-card ${cardClass}`;
      card.innerHTML = `
        <div class="device-card-top">
          <div class="device-card-name">${device.name}</div>
          <span class="device-badge ${badgeClass}">${getPlatformIcon(device.type, 13)} ${badgeLabel}</span>
        </div>
        <div class="device-card-ip-wrap">
          <span class="device-card-ip-label">${ipLabelText}</span>
          <span class="device-card-ip">${device.ip}</span>
        </div>
        ${desc}
      `;

      const actions = document.createElement("div");
      actions.className = "inline-actions";
      if (device.type === "android") {
        actions.appendChild(actionButton("Connect", () => connectDevice(device)));
        actions.appendChild(actionButton("Install APK", () => installAppToDevice(device)));
        actions.appendChild(actionButton("Start Frida", () => socket.emit("start_frida_server", { device_id: device.id })));
        actions.appendChild(actionButton("Upload File", () => uploadToDevice(device)));
        actions.appendChild(actionButton("List Apps", () => { window.location.href = `/apps?device=${device.id}`; }));
      } else {
        actions.appendChild(actionButton("File Upload", () => renderIframe(card, `http://${device.ip}:11111`)));
        actions.appendChild(actionButton("Install IPA", () => installIpaToDevice(device)));
        actions.appendChild(actionButton("List Apps", () => { window.location.href = `/apps?device=${device.id}`; }));
      }
      card.appendChild(actions);
      cards.appendChild(card);
    });
  };

  const radios = document.querySelectorAll('input[name="osFilter"]');
  radios.forEach(r => {
    r.onchange = (e) => { filter = e.target.value; rerender(); };
  });

  const filterAllBtn = document.getElementById("filterAll");
  if (filterAllBtn && filterAllBtn.tagName.toLowerCase() === 'button') {
    // Fallback if toggles aren't present
    document.getElementById("filterAll").onclick = () => { filter = "all"; rerender(); };
    document.getElementById("filterAndroid").onclick = () => { filter = "android"; rerender(); };
    document.getElementById("filterIos").onclick = () => { filter = "ios"; rerender(); };
  }

  rerender();

  const proxy = await api("/api/proxy-info");
  const proxyWifi = document.getElementById("proxyWifi");
  if (proxyWifi) proxyWifi.textContent = `Configure WiFi proxy to: ${proxy.pc_ip}:8080`;

  const sshIp = document.getElementById("sshIp");
  const sshPort = document.getElementById("sshPort");
  const sshId = document.getElementById("sshId");
  const sshPass = document.getElementById("sshPass");
  const sshCommand = document.getElementById("sshCommand");
  const connectSshBtn = document.getElementById("connectSshBtn");
  const runSshBtn = document.getElementById("runSshCmd");
  const disconnectSshBtn = document.getElementById("disconnectSshBtn");
  const clearSshOut = document.getElementById("clearSshOut");
  const sshOut = document.getElementById("sshTerminalOut");

  if (
    sshIp && sshPort && sshId && sshPass && sshCommand &&
    connectSshBtn && runSshBtn && disconnectSshBtn && clearSshOut && sshOut
  ) {
    sshIp.innerHTML = devices.length
      ? devices.map((d) => `<option value="${d.ip}" data-id="${d.ssh_id || ''}" data-pass="${d.ssh_pass || ''}">${d.name} - ${d.ip}</option>`).join("")
      : "<option value=''>No devices</option>";

    sshIp.onchange = () => {
      const selected = sshIp.options[sshIp.selectedIndex];
      if (selected) {
        if (selected.dataset.id) sshId.value = selected.dataset.id;
        if (selected.dataset.pass) sshPass.value = selected.dataset.pass;
      }
    };
    sshIp.dispatchEvent(new Event('change'));

    const writeSsh = (text) => {
      const ts = new Date().toLocaleTimeString();
      sshOut.textContent += `[${ts}] ${text}\n`;
      sshOut.scrollTop = sshOut.scrollHeight;
    };

    connectSshBtn.onclick = async () => {
      const ip = sshIp.value.trim();
      const port = sshPort.value.trim() || "8022";
      const id = sshId.value.trim();
      const pass = sshPass.value;
      if (!ip || !id || !pass) {
        toast("Fill ip, port, id and pass");
        return;
      }
      const out = await api("/api/ssh/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, port, id, pass }),
      });
      if (out.status === "success") {
        sshSessionId = out.session_id;
        writeSsh(out.output || "Connected");
        toast("SSH connected");
      } else {
        writeSsh(`ERROR: ${out.message || out.output || "Command failed"}`);
      }
    };

    runSshBtn.onclick = async () => {
      const command = sshCommand.value.trim();
      if (!sshSessionId) {
        toast("Connect SSH first");
        return;
      }
      if (!command) {
        toast("Enter command");
        return;
      }
      writeSsh(`$ ${command}`);
      const out = await api("/api/ssh/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sshSessionId, command }),
      });
      if (out.status === "success") {
        writeSsh(out.output || "(no output)");
      } else {
        writeSsh(`ERROR: ${out.message || out.output || "Command failed"}`);
      }
    };

    disconnectSshBtn.onclick = async () => {
      if (!sshSessionId) {
        toast("No active SSH session");
        return;
      }
      const out = await api("/api/ssh/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sshSessionId }),
      });
      if (out.status === "success") {
        writeSsh("Disconnected.");
      } else {
        writeSsh(`ERROR: ${out.message || "Disconnect failed"}`);
      }
      sshSessionId = null;
    };

    clearSshOut.onclick = () => {
      sshOut.textContent = "";
    };
  }

  // --- CA Certificate Installer binding ---
  const certDeviceSelect = document.getElementById("certDeviceSelect");
  const certFileInput = document.getElementById("certFileInput");
  const uploadCertBtn = document.getElementById("uploadCertBtn");
  
  if (certDeviceSelect && certFileInput && uploadCertBtn) {
    const androidDevices = devices.filter(d => d.type === "android");
    certDeviceSelect.innerHTML = androidDevices.length
      ? androidDevices.map(d => `<option value="${d.id}">${d.name} (${d.ip})</option>`).join("")
      : "<option value=''>No Android Devices</option>";
      
    uploadCertBtn.onclick = () => {
      if (!certDeviceSelect.value) {
        toast("Please register and select an Android device first");
        return;
      }
      certFileInput.click();
    };
    
    certFileInput.onchange = async () => {
      if (!certFileInput.files.length) return;
      const fd = new FormData();
      fd.append("device_id", certDeviceSelect.value);
      fd.append("file", certFileInput.files[0]);
      toast("Installing CA Certificate...");
      try {
        const res = await fetch("/api/cert/install", { method: "POST", body: fd }).then(r => r.json());
        toast(res.message || "CA Certificate Installation completed");
        debugLog(`CA Certificate: ${res.message || "completed"}`);
      } catch (err) {
        toast("Error: " + err.message);
      }
      certFileInput.value = "";
    };
  }



  // --- Logcat Streamer binding ---
  const logcatDeviceSelect = document.getElementById("logcatDeviceSelect");
  const logcatFilterText = document.getElementById("logcatFilterText");
  const startLogcatBtn = document.getElementById("startLogcatBtn");
  const stopLogcatBtn = document.getElementById("stopLogcatBtn");
  const clearLogcatBtn = document.getElementById("clearLogcatBtn");
  const logcatOutput = document.getElementById("logcatOutput");

  if (logcatDeviceSelect && logcatFilterText && startLogcatBtn && stopLogcatBtn && clearLogcatBtn && logcatOutput) {
    const androidDevices = devices.filter(d => d.type === "android");
    logcatDeviceSelect.innerHTML = androidDevices.length
      ? androidDevices.map(d => `<option value="${d.id}">${d.name} (${d.ip})</option>`).join("")
      : "<option value=''>No Android Devices</option>";

    startLogcatBtn.onclick = () => {
      if (!logcatDeviceSelect.value) {
        toast("Select an Android device first");
        return;
      }
      logcatOutput.textContent += "\n[SYSTEM] Starting logcat stream...\n";
      socket.emit("start_logcat", {
        device_id: logcatDeviceSelect.value,
        filter_text: logcatFilterText.value
      });
      toast("Logcat Started");
    };

    stopLogcatBtn.onclick = () => {
      if (!logcatDeviceSelect.value) return;
      socket.emit("stop_logcat", { device_id: logcatDeviceSelect.value });
      logcatOutput.textContent += "\n[SYSTEM] Logcat stream stopped.\n";
      toast("Logcat Stopped");
    };

    clearLogcatBtn.onclick = () => {
      logcatOutput.textContent = "";
    };
  }

  // --- Network ADB Shell Console binding ---
  const adbShellIp = document.getElementById("adbShellIp");
  const adbShellCommand = document.getElementById("adbShellCommand");
  const connectAdbShellBtn = document.getElementById("connectAdbShellBtn");
  const runAdbShellCmd = document.getElementById("runAdbShellCmd");
  const disconnectAdbShellBtn = document.getElementById("disconnectAdbShellBtn");
  const clearAdbShellOut = document.getElementById("clearAdbShellOut");
  const adbShellOut = document.getElementById("adbShellTerminalOut");

  if (
    adbShellIp && adbShellCommand && connectAdbShellBtn &&
    runAdbShellCmd && disconnectAdbShellBtn && clearAdbShellOut && adbShellOut
  ) {
    const androidDevices = devices.filter(d => d.type === "android");
    adbShellIp.innerHTML = androidDevices.length
      ? androidDevices.map(d => `<option value="${d.id}">${d.name} (${d.ip})</option>`).join("")
      : "<option value=''>No Android Devices</option>";

    let adbSessionId = null;

    const writeAdb = (text) => {
      const ts = new Date().toLocaleTimeString();
      adbShellOut.textContent += `[${ts}] ${text}\n`;
      adbShellOut.scrollTop = adbShellOut.scrollHeight;
    };

    connectAdbShellBtn.onclick = async () => {
      const device_id = adbShellIp.value;
      if (!device_id) {
        toast("Please select an Android device");
        return;
      }
      toast("Connecting network ADB shell...");
      try {
        const out = await api("/api/adb/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_id })
        });
        if (out.status === "success") {
          adbSessionId = out.session_id;
          writeAdb(out.output || "Connected to ADB shell");
          toast("ADB shell connected");
        } else {
          writeAdb(`ERROR: ${out.message}`);
          toast("Failed to connect");
        }
      } catch (err) {
        writeAdb(`ERROR: ${err.message}`);
      }
    };

    runAdbShellCmd.onclick = async () => {
      const command = adbShellCommand.value.trim();
      if (!adbSessionId) {
        toast("Connect ADB Shell first");
        return;
      }
      if (!command) {
        toast("Enter command");
        return;
      }
      writeAdb(`$ ${command}`);
      try {
        const out = await api("/api/adb/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: adbSessionId, command })
        });
        if (out.status === "success") {
          writeAdb(out.output || "(no output)");
        } else {
          writeAdb(`ERROR: ${out.message}`);
        }
      } catch (err) {
        writeAdb(`ERROR: ${err.message}`);
      }
    };

    disconnectAdbShellBtn.onclick = async () => {
      if (!adbSessionId) {
        toast("No active ADB session");
        return;
      }
      try {
        const out = await api("/api/adb/disconnect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: adbSessionId })
        });
        if (out.status === "success") {
          writeAdb("Disconnected.");
        } else {
          writeAdb(`ERROR: ${out.message}`);
        }
      } catch (err) {
        writeAdb(`ERROR: ${err.message}`);
      }
      adbSessionId = null;
    };

    clearAdbShellOut.onclick = () => {
      adbShellOut.textContent = "";
    };
  }
}

async function renderDevicesPage() {
  const form = document.getElementById("deviceForm");
  const grid = document.getElementById("deviceGrid");
  if (!form || !grid) return;

  const modal = document.getElementById("deviceModal");
  const openAddBtn = document.getElementById("openAddDeviceBtn");
  const closeBtn = document.getElementById("closeModalBtn");
  const cancelBtn = document.getElementById("cancelModalBtn");
  const modalTitle = document.getElementById("modalTitle");
  const submitBtn = document.getElementById("modalSubmitBtn");
  const countPill = document.getElementById("deviceCountPill");

  const idField = document.getElementById("deviceId");
  const nameField = document.getElementById("deviceName");
  const ipField = document.getElementById("deviceIp");
  const ipLabel = document.getElementById("deviceIpLabel");
  const typeField = document.getElementById("deviceType");
  const descField = document.getElementById("deviceDescription");
  const sshIdField = document.getElementById("deviceSshId");
  const sshPassField = document.getElementById("deviceSshPass");

  const platformBtnAndroid = document.getElementById("platformBtnAndroid");
  const platformBtnIos = document.getElementById("platformBtnIos");

  const setPlatform = (platform) => {
    const p = (platform === "ios") ? "ios" : "android";
    typeField.value = p;
    const isIos = (p === "ios");

    if (platformBtnAndroid) {
      platformBtnAndroid.classList.toggle("active", !isIos);
    }
    if (platformBtnIos) {
      platformBtnIos.classList.toggle("active", isIos);
    }

    if (isIos) {
      if (ipLabel) ipLabel.textContent = "Network IP Address";
      if (nameField) nameField.placeholder = "e.g. iPhone 14 Pro (iOS 16.5)";
      if (ipField) ipField.placeholder = "e.g. 192.168.1.120";
    } else {
      if (ipLabel) ipLabel.textContent = "Network IP / USB Serial";
      if (nameField) nameField.placeholder = "e.g. POCO X3 / Pixel 7";
      if (ipField) ipField.placeholder = "e.g. 192.168.1.101 or 131b62b1";
    }
  };

  document.querySelectorAll(".platform-pill-btn").forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const chosen = btn.getAttribute("data-type") || "android";
      setPlatform(chosen);
    };
  });

  const openModal = (editDevice) => {
    form.reset();
    idField.value = "";
    if (editDevice) {
      modalTitle.textContent = "Edit Target Device";
      submitBtn.textContent = "Update Device";
      idField.value = editDevice.id;
      nameField.value = editDevice.name;
      ipField.value = editDevice.ip;
      descField.value = editDevice.description || "";
      sshIdField.value = editDevice.ssh_id || "";
      sshPassField.value = editDevice.ssh_pass || "";
      setPlatform(editDevice.type || "android");
    } else {
      modalTitle.textContent = "Add Target Device";
      submitBtn.textContent = "Save Device";
      setPlatform("android");
    }
    if (modal) modal.classList.add("open");
  };

  const closeModal = () => { if (modal) modal.classList.remove("open"); };

  if (openAddBtn) openAddBtn.onclick = () => openModal(null);
  if (closeBtn)   closeBtn.onclick   = closeModal;
  if (cancelBtn)  cancelBtn.onclick  = closeModal;
  if (modal) {
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  }

  const paint = async () => {
    const devices = await getDevices();
    if (countPill) countPill.textContent = devices.length;
    if (!devices.length) {
      grid.innerHTML = `<div class="empty-state"><p>No devices registered yet.</p><button onclick="document.getElementById('openAddDeviceBtn').click()" style="background:#fff;color:#000;font-weight:700;padding:10px 20px;border:none;border-radius:8px;cursor:pointer;">+ Add your first target</button></div>`;
      return;
    }
    grid.innerHTML = devices.map((d) => {
      const badgeClass = d.type === "ios" ? "badge-ios" : "badge-android";
      const cardClass = d.type === "ios" ? "ios" : "android";
      const badgeLabel = d.type === "ios" ? "iOS" : "Android";
      const desc = d.description ? `<div class="device-card-desc">${d.description}</div>` : `<div class="device-card-desc" style="opacity:0.4;font-style:italic;">No description provided</div>`;
      const isUsbSerial = !d.ip.includes(".") && !d.ip.includes(":");
      const ipLabelText = isUsbSerial ? "USB SERIAL" : "IP ADDRESS";

      return `<div class="device-card ${cardClass}">
        <div class="device-card-top">
          <div class="device-card-name">${d.name}</div>
          <span class="device-badge ${badgeClass}">${getPlatformIcon(d.type, 13)} ${badgeLabel}</span>
        </div>
        <div class="device-card-ip-wrap">
          <span class="device-card-ip-label">${ipLabelText}</span>
          <span class="device-card-ip">${d.ip}</span>
        </div>
        ${desc}
        <div class="device-card-actions">
          <button class="btn-edit" onclick="window.__editDevice('${d.id}')">Edit</button>
          <button class="btn-delete" onclick="window.__deleteDevice('${d.id}')">Delete</button>
        </div>
      </div>`;
    }).join("");

    window.__editDevice = (id) => {
      const device = devices.find((d) => d.id === id);
      if (device) openModal(device);
    };

    window.__deleteDevice = async (id) => {
      const out = await api(`/api/devices/${id}`, { method: "DELETE" });
      toast(out.message || "Device deleted");
      await paint();
    };
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name: nameField.value.trim(),
      ip: ipField.value.trim(),
      type: typeField.value,
      description: descField.value.trim(),
      ssh_id: sshIdField.value.trim(),
      ssh_pass: sshPassField.value,
    };
    let out;
    if (idField.value) {
      out = await api(`/api/devices/${idField.value}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      out = await api("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    toast(out.message || "Saved");
    closeModal();
    await paint();
  };

  await paint();
}

async function renderAppsPage() {
  const select = document.getElementById("appDeviceSelect");
  const btn = document.getElementById("refreshAppsBtn");
  const search = document.getElementById("appsSearch");
  const prevBtn = document.getElementById("appsPrevBtn");
  const nextBtn = document.getElementById("appsNextBtn");
  if (!select || !btn || !socket) return;

  const devices = await getDevices();
  if (!devices.length) {
    select.innerHTML = "<option value=''>No devices</option>";
    return;
  }
  select.innerHTML = devices.map((d) => `<option value="${d.id}">${d.name} (${d.type})</option>`).join("");

  const params = new URLSearchParams(window.location.search);
  const selectedFromQuery = params.get("device");
  if (selectedFromQuery) select.value = selectedFromQuery;

  btn.onclick = () => {
    appsPage = 1;
    socket.emit("get_app_list", { device_id: select.value });
  };
  if (search) {
    search.oninput = () => {
      appsPage = 1;
      renderApps(currentApps);
    };
  }
  if (prevBtn) {
    prevBtn.onclick = () => {
      if (appsPage > 1) {
        appsPage -= 1;
        renderApps(currentApps);
      }
    };
  }
  if (nextBtn) {
    nextBtn.onclick = () => {
      appsPage += 1;
      renderApps(currentApps);
    };
  }

  // --- Frida Script Hub Binding ---
  const scriptSelect = document.getElementById("scriptSelect");
  const newScriptName = document.getElementById("newScriptName");
  const saveScriptBtn = document.getElementById("saveScriptBtn");
  const deleteScriptBtn = document.getElementById("deleteScriptBtn");
  const scriptContentArea = document.getElementById("scriptContentArea");
  const scriptPackageName = document.getElementById("scriptPackageName");
  const runScriptBtn = document.getElementById("runScriptBtn");
  const stopScriptBtn = document.getElementById("stopScriptBtn");

  if (
    scriptSelect && newScriptName && saveScriptBtn && deleteScriptBtn &&
    scriptContentArea && scriptPackageName && runScriptBtn && stopScriptBtn
  ) {
    let scriptList = [];
    
    const loadScripts = async () => {
      try {
        const res = await api("/api/scripts");
        if (res.status === "success") {
          scriptList = res.scripts || [];
          scriptSelect.innerHTML = scriptList.length
            ? scriptList.map(s => `<option value="${s.name}">${s.name}</option>`).join("")
            : "<option value=''>No scripts saved</option>";
          
          if (scriptList.length) {
            scriptSelect.dispatchEvent(new Event('change'));
          } else {
            scriptContentArea.value = "";
          }
        }
      } catch (err) {
        toast("Failed to load scripts: " + err.message);
      }
    };

    scriptSelect.onchange = () => {
      const selected = scriptList.find(s => s.name === scriptSelect.value);
      if (selected) {
        scriptContentArea.value = selected.content || "";
        newScriptName.value = selected.name;
      }
    };

    saveScriptBtn.onclick = async () => {
      const name = newScriptName.value.trim();
      const content = scriptContentArea.value;
      if (!name || !content) {
        toast("Please provide both name and content");
        return;
      }
      try {
        const res = await api("/api/scripts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, content })
        });
        toast(res.message || "Script saved");
        await loadScripts();
        scriptSelect.value = name.endsWith(".js") ? name : name + ".js";
        scriptSelect.dispatchEvent(new Event('change'));
      } catch (err) {
        toast("Failed to save: " + err.message);
      }
    };

    deleteScriptBtn.onclick = async () => {
      if (!scriptSelect.value) return;
      if (!confirm("Are you sure you want to delete this script?")) return;
      try {
        const res = await api(`/api/scripts/${scriptSelect.value}`, { method: "DELETE" });
        toast(res.message || "Script deleted");
        newScriptName.value = "";
        await loadScripts();
      } catch (err) {
        toast("Failed to delete: " + err.message);
      }
    };

    runScriptBtn.onclick = () => {
      const package_name = scriptPackageName.value.trim();
      const content = scriptContentArea.value;
      const device_id = select.value;
      if (!package_name || !content || !device_id) {
        toast("Please verify device connection, package name, and script content");
        return;
      }
      socket.emit("run_frida_script", {
        device_id,
        package_name,
        script_content: content
      });
      toast("Injected script trigger sent");
    };

    stopScriptBtn.onclick = () => {
      const package_name = scriptPackageName.value.trim();
      const device_id = select.value;
      if (!package_name || !device_id) {
        toast("Device connection and package name are required");
        return;
      }
      socket.emit("stop_frida_script", { device_id, package_name });
      toast("Stop request sent");
    };

    loadScripts();
  }

  // --- Storage Explorer (SQLite & XML) Binding ---
  const storagePackageName = document.getElementById("storagePackageName");
  const scanStorageBtn = document.getElementById("scanStorageBtn");
  const storageFileSelect = document.getElementById("storageFileSelect");
  const readStorageFileBtn = document.getElementById("readStorageFileBtn");
  const sqliteConsole = document.getElementById("sqliteConsole");
  const sqlQueryText = document.getElementById("sqlQueryText");
  const runSqlBtn = document.getElementById("runSqlBtn");
  const sqlResultWrap = document.getElementById("sqlResultWrap");
  const sharedPrefConsole = document.getElementById("sharedPrefConsole");
  const prefXmlOutput = document.getElementById("prefXmlOutput");

  if (
    storagePackageName && scanStorageBtn && storageFileSelect && readStorageFileBtn &&
    sqliteConsole && sqlQueryText && runSqlBtn && sqlResultWrap && sharedPrefConsole && prefXmlOutput
  ) {
    scanStorageBtn.onclick = async () => {
      const device_id = select.value;
      const package = storagePackageName.value.trim();
      if (!device_id || !package) {
        toast("Please select a device and enter a package name");
        return;
      }
      toast("Scanning application storage...");
      try {
        const res = await api(`/api/device/db/list?device_id=${device_id}&package=${package}`);
        if (res.status === "success") {
          const files = res.files || [];
          storageFileSelect.innerHTML = files.length
            ? files.map(f => `<option value="${f}">${f}</option>`).join("")
            : "<option value=''>No database or preference files discovered</option>";
          toast(`Discovered ${files.length} storage files`);
        } else {
          toast(res.message || "Failed to scan storage");
          storageFileSelect.innerHTML = "<option value=''>Scan failed</option>";
        }
      } catch (err) {
        toast("Error scanning: " + err.message);
      }
    };

    readStorageFileBtn.onclick = async () => {
      const device_id = select.value;
      const package = storagePackageName.value.trim();
      const filePath = storageFileSelect.value;
      if (!device_id || !package || !filePath) {
        toast("Verify scan results and selections");
        return;
      }

      sqliteConsole.style.display = "none";
      sharedPrefConsole.style.display = "none";
      sqlResultWrap.innerHTML = "";
      prefXmlOutput.textContent = "";

      if (filePath.endsWith(".db") || filePath.includes("sqlite")) {
        sqliteConsole.style.display = "block";
        sqlQueryText.value = "SELECT name FROM sqlite_master WHERE type='table'";
        
        runSqlBtn.onclick = async () => {
          const sql = sqlQueryText.value.trim();
          if (!sql) return;
          toast("Executing SQL Query...");
          try {
            const res = await fetch("/api/device/db/query", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ device_id, package, db_path: filePath, sql })
            }).then(r => r.json());
            
            if (res.status === "success") {
              const cols = res.columns || [];
              const rows = res.rows || [];
              if (!rows.length) {
                sqlResultWrap.innerHTML = "<p style='color:var(--text-dim)'>Query returned 0 rows successfully.</p>";
                return;
              }
              const ths = cols.map(c => `<th>${c}</th>`).join("");
              const trs = rows.map(r => `<tr>${r.map(v => `<td>${v !== null ? v : 'NULL'}</td>`).join("")}</tr>`).join("");
              sqlResultWrap.innerHTML = `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
              toast("Query complete");
            } else {
              sqlResultWrap.innerHTML = `<p style="color:var(--red)">ERROR: ${res.message}</p>`;
              toast("Query failed");
            }
          } catch (err) {
            toast("Error executing query: " + err.message);
          }
        };
        runSqlBtn.onclick();
      } else if (filePath.endsWith(".xml")) {
        sharedPrefConsole.style.display = "block";
        toast("Loading configuration settings...");
        try {
          const res = await api(`/api/device/pref/read?device_id=${device_id}&package=${package}&pref_path=${filePath}`);
          if (res.status === "success") {
            prefXmlOutput.textContent = res.content || "(empty)";
            toast("Loaded preferences file");
          } else {
            prefXmlOutput.textContent = "ERROR: " + res.message;
            toast("Failed to load file");
          }
        } catch (err) {
          toast("Error loading preferences: " + err.message);
        }
      }
    };
  }

  // --- Frida Memory Scanner Binding ---
  const memorySearchPattern = document.getElementById("memorySearchPattern");
  const scanMemoryBtn = document.getElementById("scanMemoryBtn");
  if (memorySearchPattern && scanMemoryBtn) {
    scanMemoryBtn.onclick = async () => {
      const device_id = select.value;
      const package_name = scriptPackageName.value.trim();
      const pattern = memorySearchPattern.value.trim();
      if (!device_id || !package_name || !pattern) {
        toast("Please select a connected device, enter package name, and input a pattern");
        return;
      }
      toast("Injecting memory scanner... Watch Live Logs.");
      try {
        const res = await api("/api/device/memory/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_id, package_name, pattern })
        });
        toast(res.message || "Memory scan trigger sent");
      } catch (err) {
        toast("Memory scan failed: " + err.message);
      }
    };
  }

  // --- JADX Automated APK Decompiler Binding ---
  const decompilerFileInput = document.getElementById("decompilerFileInput");
  const uploadDecompilerApkBtn = document.getElementById("uploadDecompilerApkBtn");
  const decompileStatusLabel = document.getElementById("decompileStatusLabel");
  const decompileWorkspace = document.getElementById("decompileWorkspace");
  const decompileTreeColumn = document.getElementById("decompileTreeColumn");
  const decompileSourceColumn = document.getElementById("decompileSourceColumn");
  const sourceFileTitle = document.getElementById("sourceFileTitle");
  const decompiledSourceOutput = document.getElementById("decompiledSourceOutput");

  if (
    decompilerFileInput && uploadDecompilerApkBtn && decompileStatusLabel &&
    decompileWorkspace && decompileTreeColumn && decompileSourceColumn &&
    sourceFileTitle && decompiledSourceOutput
  ) {
    let outputDirName = null;

    uploadDecompilerApkBtn.onclick = () => {
      decompilerFileInput.click();
    };

    decompilerFileInput.onchange = async () => {
      if (!decompilerFileInput.files.length) return;
      const file = decompilerFileInput.files[0];
      const fd = new FormData();
      fd.append("file", file);

      decompileStatusLabel.textContent = "Uploading & triggering decompilation...";
      toast("Decompilation started in background");

      try {
        const res = await fetch("/api/decompile/upload", {
          method: "POST",
          body: fd
        }).then(r => r.json());

        if (res.status === "success") {
          outputDirName = res.output_dir_name;
          decompileStatusLabel.textContent = "Decompiling... check Server Logs";
          toast("Background decompile thread active");
          
          // Show workspace and start checking tree
          decompileWorkspace.style.display = "flex";
          setTimeout(refreshTree, 3500);
        } else {
          decompileStatusLabel.textContent = "Decompile failed to start";
          toast(res.message || "Error starting JADX");
        }
      } catch (err) {
        decompileStatusLabel.textContent = "Decompile error";
        toast("Error: " + err.message);
      }
      decompilerFileInput.value = "";
    };

    const renderNode = (entry) => {
      const item = document.createElement("div");
      item.style.paddingLeft = "10px";
      item.style.margin = "4px 0";
      
      const icon = entry.isDir ? "📁" : "📄";
      const nameSpan = document.createElement("span");
      nameSpan.textContent = `${icon} ${entry.name}`;
      nameSpan.style.cursor = "pointer";
      nameSpan.style.color = entry.isDir ? "var(--cyan)" : "#fff";
      
      if (entry.isDir) {
        const childrenContainer = document.createElement("div");
        childrenContainer.style.display = "none";
        nameSpan.onclick = async () => {
          if (childrenContainer.style.display === "none") {
            // Load subdirectory contents
            try {
              const res = await api(`/api/decompile/tree?dir_name=${outputDirName}&path=${entry.path}`);
              if (res.status === "success") {
                childrenContainer.innerHTML = "";
                res.entries.forEach(child => {
                  childrenContainer.appendChild(renderNode(child));
                });
                childrenContainer.style.display = "block";
              }
            } catch (err) {
              toast("Error loading folder: " + err.message);
            }
          } else {
            childrenContainer.style.display = "none";
          }
        };
        item.appendChild(nameSpan);
        item.appendChild(childrenContainer);
      } else {
        nameSpan.onclick = async () => {
          sourceFileTitle.textContent = `Viewing: ${entry.name}`;
          decompiledSourceOutput.textContent = "Loading file content...";
          try {
            const res = await api(`/api/decompile/file?dir_name=${outputDirName}&path=${entry.path}`);
            if (res.status === "success") {
              decompiledSourceOutput.textContent = res.content || "(empty file)";
            } else {
              decompiledSourceOutput.textContent = "ERROR: " + res.message;
            }
          } catch (err) {
            decompiledSourceOutput.textContent = "ERROR: " + err.message;
          }
        };
        item.appendChild(nameSpan);
      }
      return item;
    };

    const refreshTree = async () => {
      if (!outputDirName) return;
      try {
        const res = await api(`/api/decompile/tree?dir_name=${outputDirName}`);
        if (res.status === "success") {
          decompileTreeColumn.innerHTML = "";
          if (res.entries.length === 0) {
            decompileTreeColumn.innerHTML = "<div style='color:var(--text-dim)'>No files decompiled yet. Click folder names once decompile completes.</div>";
          } else {
            res.entries.forEach(entry => {
              decompileTreeColumn.appendChild(renderNode(entry));
            });
          }
          decompileStatusLabel.textContent = "Source Tree Explorer Active";
        }
      } catch (err) {
        decompileTreeColumn.innerHTML = `<div style="color:var(--red)">Failed to load: ${err.message}</div>`;
      }
    };

    // Add manual refresh button to explorer
    const refBtn = document.createElement("button");
    refBtn.textContent = "Refresh Tree";
    refBtn.style.padding = "4px 8px";
    refBtn.style.fontSize = "11px";
    refBtn.style.marginBottom = "8px";
    refBtn.onclick = refreshTree;
    decompileTreeColumn.parentNode.insertBefore(refBtn, decompileTreeColumn);
  }
}

function renderApps(apps) {
  const box = document.getElementById("appsList");
  const select = document.getElementById("appDeviceSelect");
  const search = document.getElementById("appsSearch");
  const pageInfo = document.getElementById("appsPageInfo");
  const prevBtn = document.getElementById("appsPrevBtn");
  const nextBtn = document.getElementById("appsNextBtn");
  currentApps = Array.isArray(apps) ? apps : [];
  if (!box) return;
  if (!currentApps.length) {
    box.innerHTML = "<p>No apps returned from frida-ps.</p>";
    return;
  }
  const q = (search ? search.value : "").toLowerCase().trim();
  const filtered = currentApps.filter((a) => {
    if (!q) return true;
    return (a.name || "").toLowerCase().includes(q) || (a.package || "").toLowerCase().includes(q);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / APPS_PAGE_SIZE));
  if (appsPage > totalPages) appsPage = totalPages;
  const start = (appsPage - 1) * APPS_PAGE_SIZE;
  const end = start + APPS_PAGE_SIZE;
  const shown = filtered.slice(start, end);
  const devicesText = select.options[select.selectedIndex].textContent.toLowerCase();
  const deviceType = devicesText.includes("(ios)") ? "ios" : "android";

  if (!shown.length) {
    box.innerHTML = "<p>No matching apps.</p>";
    return;
  }

  if (pageInfo) pageInfo.textContent = `Page ${appsPage} / ${totalPages}`;
  if (prevBtn) prevBtn.disabled = appsPage <= 1;
  if (nextBtn) nextBtn.disabled = appsPage >= totalPages;

  box.innerHTML = `<p>Showing ${start + 1}-${Math.min(end, filtered.length)} of ${filtered.length} matched apps</p>` + shown
    .map(
      (a) => `<div class="app-item">
        <b>${a.name}</b><br>
        <span class="mono">${a.package}</span>
        <div class="inline-actions">
          <button onclick="window.__selectPackage('${a.package}')">Select Target</button>
          <button onclick="window.__objection('${a.package}')">Objection</button>
        </div>
      </div>`
    )
    .join("");

  window.__selectPackage = (pkg) => {
    const scriptPkg = document.getElementById("scriptPackageName");
    const storagePkg = document.getElementById("storagePackageName");
    if (scriptPkg) scriptPkg.value = pkg;
    if (storagePkg) storagePkg.value = pkg;
    toast("Target app package selected: " + pkg);
  };

  window.__objection = (pkg) => {
    const sslCommand = deviceType === "android" ? "android sslpinning disable" : "ios sslpinning disable";
    const popupText = `After Objection opens, run:\n\n${sslCommand}\n\n(Copied to clipboard)`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(sslCommand).catch(() => {});
    }
    window.alert(popupText);
    socket.emit("launch_objection", { app_name: pkg });
  };
}

function bootstrap() {
  attachSocketListeners();
  const page = getPage();
  if (page === "dashboard") renderDashboard();
  if (page === "devices") renderDevicesPage();
  if (page === "apps") renderAppsPage();

  // --- Tab switching logic for Logcat vs Server logs ---
  const tabLogcat = document.getElementById("tabLogcat");
  const tabServer = document.getElementById("tabServer");
  const contentLogcat = document.getElementById("contentLogcat");
  const contentServer = document.getElementById("contentServer");
  const clearServerLogsBtn = document.getElementById("clearServerLogsBtn");
  const debugConsole = document.getElementById("debugConsole");

  if (tabLogcat && tabServer && contentLogcat && contentServer) {
    tabLogcat.onclick = () => {
      tabLogcat.classList.add("active");
      tabLogcat.style.color = "var(--cyan)";
      tabLogcat.style.borderBottom = "2px solid var(--cyan)";
      
      tabServer.classList.remove("active");
      tabServer.style.color = "var(--text-dim)";
      tabServer.style.borderBottom = "none";
      
      contentLogcat.style.display = "block";
      contentServer.style.display = "none";
    };

    tabServer.onclick = () => {
      tabServer.classList.add("active");
      tabServer.style.color = "var(--cyan)";
      tabServer.style.borderBottom = "2px solid var(--cyan)";
      
      tabLogcat.classList.remove("active");
      tabLogcat.style.color = "var(--text-dim)";
      tabLogcat.style.borderBottom = "none";
      
      contentServer.style.display = "block";
      contentLogcat.style.display = "none";
    };
  }

  if (clearServerLogsBtn && debugConsole) {
    clearServerLogsBtn.onclick = () => {
      debugLines = [];
      debugConsole.textContent = "";
    };
  }
}

bootstrap();
