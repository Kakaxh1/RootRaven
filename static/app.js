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
  if (p === "/vault") return "vault";
  if (p === "/masvs") return "masvs";
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
  socket.on("frida_script_output", (d) => {
    const box = document.getElementById("fridaOutputConsole");
    if (box && d.line) {
      box.textContent += d.line + "\n";
      box.scrollTop = box.scrollHeight;
    }
  });
  socket.on("frida_script_status", (d) => {
    toast(d.message || "Frida script status update");
    const label = document.getElementById("scriptStatusLabel");
    if (label) {
      label.textContent = d.message || "Updated";
      if (d.status === "success") {
        label.style.color = "#3ddc84";
      } else if (d.status === "error") {
        label.style.color = "var(--red)";
      } else {
        label.style.color = "var(--text-dim)";
      }
    }
  });
  socket.on("objection_status", (d) => toast(d.message || "Objection status update"));
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

function setupLogsPanel(devices) {
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
      actions.appendChild(actionButton("Health", () => window.__showDeviceHealth(device.id)));
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

  rerender();

  // --- Burp Setup Wizard Binding ---
  const burpDeviceSelect = document.getElementById("burpDeviceSelect");
  const burpHostIp = document.getElementById("burpHostIp");
  const burpPort = document.getElementById("burpPort");
  const setProxyBtn = document.getElementById("setProxyBtn");
  const clearProxyBtn = document.getElementById("clearProxyBtn");
  const testProxyConnBtn = document.getElementById("testProxyConnBtn");
  const certFileInput = document.getElementById("certFileInput");
  const uploadCertBtn = document.getElementById("uploadCertBtn");
  const installCertBtn = document.getElementById("installCertBtn");
  const certStatusLabel = document.getElementById("certStatusLabel");

  if (burpDeviceSelect && burpHostIp && setProxyBtn) {
    const androidDevices = devices.filter(d => d.type === "android");
    burpDeviceSelect.innerHTML = androidDevices.length
      ? androidDevices.map(d => `<option value="${d.id}">${d.name} (${d.ip})</option>`).join("")
      : "<option value=''>No Android Devices</option>";

    try {
      const proxy = await api("/api/proxy-info");
      if (proxy && proxy.pc_ip) burpHostIp.value = proxy.pc_ip;
    } catch (e) {}

    setProxyBtn.onclick = async () => {
      const device_id = burpDeviceSelect.value;
      const host = burpHostIp.value.trim();
      const port = burpPort.value.trim() || "8080";
      if (!device_id || !host) {
        toast("Please select a device and enter Burp IP");
        return;
      }
      toast("Configuring device proxy settings...");
      try {
        const res = await api("/api/set-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_id, host, port })
        });
        toast(res.message || "Proxy configured");
      } catch (err) {
        toast("Failed to set proxy: " + err.message);
      }
    };

    if (clearProxyBtn) {
      clearProxyBtn.onclick = async () => {
        const device_id = burpDeviceSelect.value;
        if (!device_id) return;
        try {
          const res = await api("/api/set-proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device_id, host: ":0", port: "" })
          });
          toast(res.message || "Proxy settings cleared");
        } catch (err) {
          toast("Failed to clear proxy: " + err.message);
        }
      };
    }

    if (testProxyConnBtn) {
      testProxyConnBtn.onclick = async () => {
        const device_id = burpDeviceSelect.value;
        if (!device_id) return;
        toast("Testing proxy connectivity from device...");
        try {
          const res = await api(`/api/devices/${device_id}/debug-http`);
          toast(res.message || "Proxy test complete");
        } catch (err) {
          toast("Proxy test error: " + err.message);
        }
      };
    }

    if (uploadCertBtn && certFileInput && installCertBtn) {
      uploadCertBtn.onclick = () => certFileInput.click();
      certFileInput.onchange = () => {
        if (certFileInput.files.length) {
          if (certStatusLabel) certStatusLabel.textContent = `Selected: ${certFileInput.files[0].name}`;
        }
      };

      installCertBtn.onclick = async () => {
        const device_id = burpDeviceSelect.value;
        if (!device_id) {
          toast("Please select an Android device");
          return;
        }
        if (!certFileInput.files.length) {
          toast("Please choose a certificate file first");
          return;
        }
        toast("Installing CA Certificate to system store...");
        const fd = new FormData();
        fd.append("device_id", device_id);
        fd.append("cert_file", certFileInput.files[0]);
        try {
          const res = await fetch("/api/install-cert", { method: "POST", body: fd }).then(r => r.json());
          toast(res.message || "Certificate installed");
          if (certStatusLabel) certStatusLabel.textContent = res.message || "Installed";
        } catch (err) {
          toast("Failed to install certificate: " + err.message);
        }
      };
    }
  }

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



  setupLogsPanel(devices);

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

  setupLogsPanel(devices);

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

  // --- Frida Script Hub Binding with Modal Popup ---
  const scriptSelect = document.getElementById("scriptSelect");
  const newScriptBtn = document.getElementById("newScriptBtn");
  const editScriptBtn = document.getElementById("editScriptBtn");
  const deleteScriptBtn = document.getElementById("deleteScriptBtn");
  const scriptContentArea = document.getElementById("scriptContentArea");
  const scriptPackageName = document.getElementById("scriptPackageName");
  const runScriptBtn = document.getElementById("runScriptBtn");
  const stopScriptBtn = document.getElementById("stopScriptBtn");
  const fridaOutputConsole = document.getElementById("fridaOutputConsole");
  const clearFridaOutBtn = document.getElementById("clearFridaOutBtn");

  const scriptModal = document.getElementById("scriptModal");
  const scriptModalTitle = document.getElementById("scriptModalTitle");
  const scriptModalForm = document.getElementById("scriptModalForm");
  const modalScriptName = document.getElementById("modalScriptName");
  const modalScriptContent = document.getElementById("modalScriptContent");
  const closeScriptModalBtn = document.getElementById("closeScriptModalBtn");
  const cancelScriptModalBtn = document.getElementById("cancelScriptModalBtn");

  if (
    scriptSelect && newScriptBtn && deleteScriptBtn &&
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

    const openScriptModal = (isEdit) => {
      if (!scriptModal) return;
      if (isEdit) {
        const selected = scriptList.find(s => s.name === scriptSelect.value);
        if (!selected) {
          toast("Please select a script to edit");
          return;
        }
        if (scriptModalTitle) scriptModalTitle.textContent = "Edit Frida Hook Script";
        if (modalScriptName) modalScriptName.value = selected.name;
        if (modalScriptContent) modalScriptContent.value = selected.content || scriptContentArea.value;
      } else {
        if (scriptModalTitle) scriptModalTitle.textContent = "Create New Frida Script";
        if (modalScriptName) modalScriptName.value = "my_custom_hook.js";
        if (modalScriptContent) {
          modalScriptContent.value = `// Frida Custom Instrumentation Script\nJava.perform(function() {\n    console.log("[*] Hook injected into target application");\n    \n    // Example: Hook a Java method\n    // var TargetClass = Java.use("com.example.app.SecurityHelper");\n    // TargetClass.verifySignature.implementation = function() {\n    //     console.log("[*] Bypassed verifySignature()");\n    //     return true;\n    // };\n});\n`;
        }
      }
      scriptModal.classList.add("open");
    };

    const closeScriptModal = () => {
      if (scriptModal) scriptModal.classList.remove("open");
    };

    if (newScriptBtn) newScriptBtn.onclick = () => openScriptModal(false);
    if (editScriptBtn) editScriptBtn.onclick = () => openScriptModal(true);
    if (closeScriptModalBtn) closeScriptModalBtn.onclick = closeScriptModal;
    if (cancelScriptModalBtn) cancelScriptModalBtn.onclick = closeScriptModal;

    if (scriptModal) {
      scriptModal.addEventListener("click", (e) => {
        if (e.target === scriptModal) closeScriptModal();
      });
    }

    if (scriptModalForm) {
      scriptModalForm.onsubmit = async (e) => {
        e.preventDefault();
        const name = modalScriptName.value.trim();
        const content = modalScriptContent.value;
        if (!name || !content) {
          toast("Please provide both script name and content");
          return;
        }
        try {
          const res = await api("/api/scripts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, content })
          });
          toast(res.message || "Script saved successfully");
          closeScriptModal();
          await loadScripts();
          const targetName = name.endsWith(".js") ? name : name + ".js";
          scriptSelect.value = targetName;
          scriptSelect.dispatchEvent(new Event('change'));
        } catch (err) {
          toast("Failed to save: " + err.message);
        }
      };
    }

    if (clearFridaOutBtn && fridaOutputConsole) {
      clearFridaOutBtn.onclick = () => {
        fridaOutputConsole.textContent = "";
      };
    }

    scriptSelect.onchange = () => {
      const selected = scriptList.find(s => s.name === scriptSelect.value);
      if (selected) {
        scriptContentArea.value = selected.content || "";
      }
    };

    deleteScriptBtn.onclick = async () => {
      if (!scriptSelect.value) return;
      if (!confirm(`Are you sure you want to delete "${scriptSelect.value}"?`)) return;
      try {
        const res = await api(`/api/scripts/${scriptSelect.value}`, { method: "DELETE" });
        toast(res.message || "Script deleted");
        await loadScripts();
      } catch (err) {
        toast("Failed to delete: " + err.message);
      }
    };

    // --- One-Click Pre-Built Snippets Loader ---
    window.__loadSnippet = async (filename) => {
      try {
        const res = await api("/api/scripts");
        if (res.status === "success" && res.scripts) {
          const found = res.scripts.find(s => s.name === filename);
          if (found) {
            scriptSelect.value = filename;
            scriptContentArea.value = found.content;
            toast("Loaded hook snippet: " + filename);
          } else {
            toast("Hook snippet not found: " + filename);
          }
        }
      } catch (e) {
        toast("Failed to load snippet: " + e.message);
      }
    };

    // --- Frida Inject Modal Setup ---
    const fridaInjectModal = document.getElementById("fridaInjectModal");
    const closeFridaInjectModalBtn = document.getElementById("closeFridaInjectModalBtn");
    const fridaModalPkg = document.getElementById("fridaModalPkg");
    const fridaModalDev = document.getElementById("fridaModalDev");
    const fridaModalCmdInput = document.getElementById("fridaModalCmdInput");
    const copyFridaCmdBtn = document.getElementById("copyFridaCmdBtn");
    const downloadFridaBatBtn = document.getElementById("downloadFridaBatBtn");
    const injectFridaWebBtn = document.getElementById("injectFridaWebBtn");

    if (closeFridaInjectModalBtn && fridaInjectModal) {
      closeFridaInjectModalBtn.onclick = () => fridaInjectModal.classList.remove("open");
      fridaInjectModal.addEventListener("click", (e) => {
        if (e.target === fridaInjectModal) fridaInjectModal.classList.remove("open");
      });
    }

    runScriptBtn.onclick = async () => {
      const package_name = scriptPackageName.value.trim();
      const content = scriptContentArea.value;
      const device_id = select.value;
      if (!package_name || !content || !device_id) {
        toast("Please select a target device, enter app package, and provide hook code");
        return;
      }

      const allDevices = await getDevices();
      const currentDev = allDevices.find(d => d.id === device_id);
      let targetFlag = "-U";
      let devLabel = select.options[select.selectedIndex]?.textContent || "Target Device";
      if (currentDev && currentDev.ip) {
        const isUsb = !currentDev.ip.includes(".") && !currentDev.ip.includes(":");
        targetFlag = isUsb ? `-D ${currentDev.ip}` : `-H ${currentDev.ip}:27042`;
        devLabel = `${currentDev.name} (${currentDev.ip})`;
      }

      const activeScriptName = scriptSelect.value || "hook_script.js";
      const fullCmd = `frida ${targetFlag} -f ${package_name} -l "${activeScriptName}" --no-pause`;

      if (fridaModalPkg) fridaModalPkg.textContent = package_name;
      if (fridaModalDev) fridaModalDev.textContent = devLabel;
      if (fridaModalCmdInput) fridaModalCmdInput.value = fullCmd;

      if (copyFridaCmdBtn) {
        copyFridaCmdBtn.onclick = () => window.__copyText(fridaModalCmdInput.value);
      }

      if (downloadFridaBatBtn) {
        downloadFridaBatBtn.onclick = () => {
          const batContent = `@echo off\ntitle RootRaven - Frida Injection (${package_name})\ncolor 0b\necho ========================================================\necho   RootRaven - Frida Dynamic Hooking Runner\necho   Target: ${package_name}\necho ========================================================\necho.\necho Executing: ${fridaModalCmdInput.value}\necho.\n${fridaModalCmdInput.value}\necho.\necho [Session Ended] Press any key to close this terminal...\npause >nul\n`;
          const blob = new Blob([batContent], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `run_frida_${package_name}.bat`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast("Downloaded run_frida.bat — double-click to launch");
        };
      }

      if (injectFridaWebBtn) {
        injectFridaWebBtn.onclick = () => {
          if (fridaInjectModal) fridaInjectModal.classList.remove("open");
          if (fridaOutputConsole) {
            const ts = new Date().toLocaleTimeString();
            fridaOutputConsole.textContent += `\n[${ts}] [SYSTEM] Injected hook into ${package_name}...\n`;
          }
          socket.emit("run_frida_script", {
            device_id,
            package_name,
            script_content: content
          });
          toast("Hook injected — streaming output in Web Console");
        };
      }

      if (fridaInjectModal) fridaInjectModal.classList.add("open");
    };

    stopScriptBtn.onclick = () => {
      const package_name = scriptPackageName.value.trim();
      const device_id = select.value;
      if (!package_name || !device_id) {
        toast("Device connection and package name are required");
        return;
      }
      if (fridaOutputConsole) {
        const ts = new Date().toLocaleTimeString();
        fridaOutputConsole.textContent += `[${ts}] [SYSTEM] Stop request sent for ${package_name}\n`;
      }
      socket.emit("stop_frida_script", { device_id, package_name });
      toast("Stop request sent");
    };

    loadScripts();
  }

  // --- Automated Static Vulnerability Scanner Binding ---
  const scannerPackageName = document.getElementById("scannerPackageName");
  const runScannerBtn = document.getElementById("runScannerBtn");
  const scannerResultsWrap = document.getElementById("scannerResultsWrap");
  const scannerSummaryBadges = document.getElementById("scannerSummaryBadges");
  const scannerFindingsList = document.getElementById("scannerFindingsList");

  if (scannerPackageName && runScannerBtn && scannerResultsWrap && scannerSummaryBadges && scannerFindingsList) {
    runScannerBtn.onclick = async () => {
      const device_id = select.value;
      const package_name = scannerPackageName.value.trim();
      if (!device_id || !package_name) {
        toast("Please select a target device and specify a package name");
        return;
      }

      runScannerBtn.disabled = true;
      runScannerBtn.textContent = "Scanning...";
      toast("Running static manifest security analysis...");

      try {
        const res = await api("/api/scan/manifest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ package_name, device_id })
        });

        if (res.status === "success") {
          const summary = res.summary || {};
          scannerSummaryBadges.innerHTML = `
            <span class="vuln-badge critical">${summary.critical || 0} Critical</span>
            <span class="vuln-badge high">${summary.high || 0} High</span>
            <span class="vuln-badge medium">${summary.medium || 0} Medium</span>
            <span class="vuln-badge low">${summary.low || 0} Low</span>
          `;

          const vulns = res.vulnerabilities || [];
          if (!vulns.length) {
            scannerFindingsList.innerHTML = `<div style="color:#3ddc84; font-size:13px;">No critical manifest vulnerabilities detected.</div>`;
          } else {
            scannerFindingsList.innerHTML = vulns.map(v => `
              <div class="vuln-card ${v.severity.toLowerCase()}">
                <div class="vuln-card-header">
                  <span class="vuln-title">${v.title}</span>
                  <span class="vuln-badge ${v.severity.toLowerCase()}">${v.severity}</span>
                </div>
                <div class="vuln-desc">${v.description}</div>
                <div class="vuln-remed"><b>Remediation:</b> ${v.remediation}</div>
              </div>
            `).join("");
          }

          scannerResultsWrap.style.display = "block";
          toast(`Scan completed: ${vulns.length} security findings discovered`);
        } else {
          toast(res.message || "Static scan failed");
        }
      } catch (err) {
        toast("Error during scan: " + err.message);
      } finally {
        runScannerBtn.disabled = false;
        runScannerBtn.textContent = "Scan App Security";
      }
    };
  }

  // --- Deep Link & Intent Fuzzer Binding ---
  const fuzzerPackageName = document.getElementById("fuzzerPackageName");
  const discoverDeeplinksBtn = document.getElementById("discoverDeeplinksBtn");
  const discoveredLinksSelect = document.getElementById("discoveredLinksSelect");
  const fuzzerPayloadPreset = document.getElementById("fuzzerPayloadPreset");
  const fuzzerCustomUri = document.getElementById("fuzzerCustomUri");
  const fuzzerIntentAction = document.getElementById("fuzzerIntentAction");
  const fuzzerExtraKey = document.getElementById("fuzzerExtraKey");
  const fuzzerExtraVal = document.getElementById("fuzzerExtraVal");
  const launchIntentFuzzBtn = document.getElementById("launchIntentFuzzBtn");
  const fuzzerStatusBadge = document.getElementById("fuzzerStatusBadge");
  const fuzzerOutputConsole = document.getElementById("fuzzerOutputConsole");

  if (
    fuzzerPackageName && discoverDeeplinksBtn && discoveredLinksSelect &&
    fuzzerPayloadPreset && fuzzerCustomUri && launchIntentFuzzBtn && fuzzerOutputConsole
  ) {
    discoverDeeplinksBtn.onclick = async () => {
      const device_id = select.value;
      const package_name = fuzzerPackageName.value.trim();
      if (!device_id || !package_name) {
        toast("Please select a target device and package name");
        return;
      }
      toast("Extracting registered deep links from manifest...");
      try {
        const res = await api("/api/fuzzer/deeplinks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ package_name, device_id })
        });
        if (res.status === "success") {
          const links = res.deeplinks || [];
          discoveredLinksSelect.innerHTML = links.length
            ? links.map(l => `<option value="${l}">${l}</option>`).join("")
            : "<option value=''>No custom schemes discovered</option>";
          if (links.length) {
            fuzzerCustomUri.value = links[0];
          }
          toast(`Discovered ${links.length} deep link patterns`);
        } else {
          toast(res.message || "Failed to discover deep links");
        }
      } catch (err) {
        toast("Error extracting deep links: " + err.message);
      }
    };

    discoveredLinksSelect.onchange = () => {
      if (discoveredLinksSelect.value) {
        fuzzerCustomUri.value = discoveredLinksSelect.value;
      }
    };

    fuzzerPayloadPreset.onchange = () => {
      const preset = fuzzerPayloadPreset.value;
      if (!preset) return;
      let baseUri = fuzzerCustomUri.value || "myapp://open";
      if (baseUri.includes("?")) {
        fuzzerCustomUri.value = `${baseUri}&param=${encodeURIComponent(preset)}`;
      } else {
        fuzzerCustomUri.value = `${baseUri}?target=${encodeURIComponent(preset)}`;
      }
      toast("Appended fuzzing payload to URI");
    };

    launchIntentFuzzBtn.onclick = async () => {
      const device_id = select.value;
      const uri = fuzzerCustomUri.value.trim();
      const action = fuzzerIntentAction.value.trim();
      const extra_key = fuzzerExtraKey.value.trim();
      const extra_val = fuzzerExtraVal.value.trim();
      const package_name = fuzzerPackageName.value.trim();

      if (!device_id) {
        toast("Please select a target device");
        return;
      }

      toast("Dispatching intent payload...");
      if (fuzzerStatusBadge) fuzzerStatusBadge.textContent = "Dispatching...";

      try {
        const res = await api("/api/fuzzer/launch-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uri, action, extra_key, extra_val, package_name, device_id })
        });

        if (fuzzerStatusBadge) {
          fuzzerStatusBadge.textContent = res.result_type || "Completed";
          fuzzerStatusBadge.style.color = res.result_type === "CRASH_OR_ERROR" ? "var(--red)" : "#3ddc84";
        }

        const ts = new Date().toLocaleTimeString();
        fuzzerOutputConsole.textContent += `\n[${ts}] Command: ${res.command || ""}\n${res.output || "(no output)"}\n`;
        fuzzerOutputConsole.scrollTop = fuzzerOutputConsole.scrollHeight;
        toast("Intent dispatched — check device & response log");
      } catch (err) {
        toast("Error launching intent: " + err.message);
      }
    };
  }

  // --- One-Click App Recon Binding ---
  const reconPackageName = document.getElementById("reconPackageName");
  const runReconBtn = document.getElementById("runReconBtn");
  const reconResultsWrap = document.getElementById("reconResultsWrap");
  const reconMetaGrid = document.getElementById("reconMetaGrid");
  const reconFlagsWrap = document.getElementById("reconFlagsWrap");
  const reconComponentSummary = document.getElementById("reconComponentSummary");

  if (reconPackageName && runReconBtn && reconResultsWrap && reconMetaGrid && reconFlagsWrap && reconComponentSummary) {
    runReconBtn.onclick = async () => {
      const device_id = select.value;
      const package_name = reconPackageName.value.trim();
      if (!device_id || !package_name) {
        toast("Please select a target device and specify a package name");
        return;
      }
      runReconBtn.disabled = true;
      runReconBtn.textContent = "Collecting Intel...";
      toast("Gathering comprehensive application metadata...");

      try {
        const res = await api("/api/recon/package", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ package_name, device_id })
        });

        if (res.status === "success") {
          const counts = res.counts || {};
          reconMetaGrid.innerHTML = `
            <div class="recon-stat-box"><span class="recon-stat-label">Version</span><span class="recon-stat-val">${res.version_name} (${res.version_code})</span></div>
            <div class="recon-stat-box"><span class="recon-stat-label">SDK Levels</span><span class="recon-stat-val">Min: ${res.min_sdk} | Target: ${res.target_sdk}</span></div>
            <div class="recon-stat-box"><span class="recon-stat-label">App UID</span><span class="recon-stat-val">${res.uid}</span></div>
            <div class="recon-stat-box"><span class="recon-stat-label">Activities / Services</span><span class="recon-stat-val">${counts.activities || 0} / ${counts.services || 0}</span></div>
            <div class="recon-stat-box"><span class="recon-stat-label">Receivers / Providers</span><span class="recon-stat-val">${counts.receivers || 0} / ${counts.providers || 0}</span></div>
            <div class="recon-stat-box"><span class="recon-stat-label">Permissions Count</span><span class="recon-stat-val">${counts.permissions || 0} Declared</span></div>
          `;

          const flags = res.flags || {};
          reconFlagsWrap.innerHTML = `
            <span class="vuln-badge ${flags.debuggable ? 'critical' : 'low'}">Debuggable: ${flags.debuggable ? 'TRUE (VULNERABLE)' : 'FALSE'}</span>
            <span class="vuln-badge ${flags.allow_backup ? 'medium' : 'low'}">AllowBackup: ${flags.allow_backup ? 'TRUE' : 'FALSE'}</span>
            <span class="vuln-badge ${flags.cleartext_traffic ? 'high' : 'low'}">Cleartext Traffic: ${flags.cleartext_traffic ? 'TRUE' : 'FALSE'}</span>
          `;

          let summaryText = `[Permissions]\n${(res.permissions || []).join('\n') || '(none)'}\n\n[Activities (First 30)]\n${(res.activities || []).join('\n') || '(none)'}\n\n[Services]\n${(res.services || []).join('\n') || '(none)'}\n\n[Broadcast Receivers]\n${(res.receivers || []).join('\n') || '(none)'}\n\n[Content Providers]\n${(res.providers || []).join('\n') || '(none)'}`;
          reconComponentSummary.textContent = summaryText;

          reconResultsWrap.style.display = "block";
          toast("Recon intel gathered successfully");
        } else {
          toast(res.message || "Failed to gather app recon");
        }
      } catch (err) {
        toast("Recon error: " + err.message);
      } finally {
        runReconBtn.disabled = false;
        runReconBtn.textContent = "Run 1-Click Recon";
      }
    };
  }

  // --- SharedPreferences Secret Finder Binding ---
  const prefScannerPackageName = document.getElementById("prefScannerPackageName");
  const runPrefScannerBtn = document.getElementById("runPrefScannerBtn");
  const prefScannerResultsWrap = document.getElementById("prefScannerResultsWrap");
  const prefFindingsList = document.getElementById("prefFindingsList");

  if (prefScannerPackageName && runPrefScannerBtn && prefScannerResultsWrap && prefFindingsList) {
    runPrefScannerBtn.onclick = async () => {
      const device_id = select.value;
      const package_name = prefScannerPackageName.value.trim();
      if (!device_id || !package_name) {
        toast("Please select a target device and specify a package name");
        return;
      }

      runPrefScannerBtn.disabled = true;
      runPrefScannerBtn.textContent = "Scanning XML...";
      toast("Scanning SharedPreferences for hardcoded secrets and tokens...");

      try {
        const res = await api("/api/scanner/shared-prefs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ package_name, device_id })
        });

        if (res.status === "success") {
          const findings = res.findings || [];
          if (!findings.length) {
            prefFindingsList.innerHTML = `<div style="color:#3ddc84; font-size:13px;">No high-risk secrets or credentials detected across ${res.scanned_files_count || 0} XML preference files.</div>`;
          } else {
            prefFindingsList.innerHTML = findings.map(f => `
              <div class="vuln-card ${f.severity.toLowerCase()}">
                <div class="vuln-card-header">
                  <span class="vuln-title">${f.type}</span>
                  <span class="vuln-badge ${f.severity.toLowerCase()}">${f.severity}</span>
                </div>
                <div class="vuln-desc"><b>Source File:</b> <code style="color:var(--cyan);">${f.file}</code></div>
                <div class="vault-code-block">${f.masked_value}</div>
                <div style="display:flex; justify-content:flex-end; gap:8px;">
                  <button type="button" class="quick-chip-btn" onclick="window.__copyText('${f.raw_value.replace(/'/g, "\\'")}')">Copy Secret</button>
                </div>
              </div>
            `).join("");
          }
          prefScannerResultsWrap.style.display = "block";
          toast(`Discovered ${findings.length} sensitive values`);
        } else {
          toast(res.message || "Failed to scan SharedPreferences");
        }
      } catch (err) {
        toast("Error: " + err.message);
      } finally {
        runPrefScannerBtn.disabled = false;
        runPrefScannerBtn.textContent = "Scan XML Secrets";
      }
    };
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
    const scannerPkg = document.getElementById("scannerPackageName");
    const fuzzerPkg = document.getElementById("fuzzerPackageName");
    if (scriptPkg) scriptPkg.value = pkg;
    if (storagePkg) storagePkg.value = pkg;
    if (scannerPkg) scannerPkg.value = pkg;
    if (fuzzerPkg) fuzzerPkg.value = pkg;
    toast("Target app package selected: " + pkg);
  };

  window.__copyText = (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    toast("Copied to clipboard: " + text);
  };

  const objectionModal = document.getElementById("objectionModal");
  const closeObjectionModalBtn = document.getElementById("closeObjectionModalBtn");
  const objectionModalPkg = document.getElementById("objectionModalPkg");
  const objectionModalDev = document.getElementById("objectionModalDev");
  const objectionModalCmd = document.getElementById("objectionModalCmd");
  const copyObjectionCmdBtn = document.getElementById("copyObjectionCmdBtn");
  const downloadObjectionBatBtn = document.getElementById("downloadObjectionBatBtn");
  const launchObjectionDirectBtn = document.getElementById("launchObjectionDirectBtn");

  if (closeObjectionModalBtn && objectionModal) {
    closeObjectionModalBtn.onclick = () => objectionModal.classList.remove("open");
    objectionModal.addEventListener("click", (e) => {
      if (e.target === objectionModal) objectionModal.classList.remove("open");
    });
  }

  window.__objection = async (pkg) => {
    const devSelect = document.getElementById("appDeviceSelect");
    const deviceId = devSelect ? devSelect.value : null;
    const selectedOpt = devSelect && devSelect.options[devSelect.selectedIndex] ? devSelect.options[devSelect.selectedIndex] : null;
    const selectedText = selectedOpt ? selectedOpt.textContent : "Selected Device";
    const isIos = selectedText.toLowerCase().includes("(ios)");

    // Determine target args
    let targetArg = "-d";
    let devLabel = selectedText;
    const allDevices = await getDevices();
    const currentDev = allDevices.find(d => d.id === deviceId);
    if (currentDev && currentDev.ip) {
      const isUsb = !currentDev.ip.includes(".") && !currentDev.ip.includes(":");
      if (isUsb) {
        targetArg = `-S ${currentDev.ip}`;
      } else {
        const hostOnly = currentDev.ip.split(":")[0];
        const portOnly = currentDev.ip.split(":")[1] || "27042";
        targetArg = `-N -h ${hostOnly} -p ${portOnly}`;
      }
      devLabel = `${currentDev.name} (${currentDev.ip})`;
    }

    const fullCmd = `objection ${targetArg} -g ${pkg} explore`;
    const sslCommand = isIos ? "ios sslpinning disable" : "android sslpinning disable";

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(sslCommand).catch(() => {});
    }

    if (objectionModalPkg) objectionModalPkg.textContent = pkg;
    if (objectionModalDev) objectionModalDev.textContent = devLabel;
    if (objectionModalCmd) objectionModalCmd.textContent = fullCmd;

    if (copyObjectionCmdBtn) {
      copyObjectionCmdBtn.onclick = () => window.__copyText(fullCmd);
    }

    if (downloadObjectionBatBtn) {
      downloadObjectionBatBtn.onclick = () => {
        const batContent = `@echo off\ntitle RootRaven - Objection (${pkg})\ncolor 0b\necho ========================================================\necho   RootRaven - Objection Interactive Security Shell\necho   Target Package: ${pkg}\necho ========================================================\necho.\necho [Tip] To disable SSL pinning, run:\necho       ${sslCommand}\necho.\necho Launching: ${fullCmd}\necho.\n${fullCmd}\necho.\necho [Session Ended] Press any key to close this terminal...\npause >nul\n`;
        const blob = new Blob([batContent], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `run_objection_${pkg}.bat`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast("Downloaded run_objection.bat — double-click to launch terminal");
      };
    }

    if (launchObjectionDirectBtn) {
      launchObjectionDirectBtn.onclick = async () => {
        toast(`Attempting to launch terminal for ${pkg}...`);
        try {
          const res = await api("/api/objection/launch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ app_name: pkg, device_id: deviceId })
          });
          if (res && res.message) toast(res.message);
        } catch (e) {
          socket.emit("launch_objection", { app_name: pkg, device_id: deviceId });
        }
      };
    }

    if (objectionModal) {
      objectionModal.classList.add("open");
    }

    // Also attempt server side trigger
    try {
      api("/api/objection/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_name: pkg, device_id: deviceId })
      }).catch(() => {});
    } catch (e) {}
  };
}

// ─────────────────────────────────────────────────────────────
// Device Health Telemetry Modal Handler
// ─────────────────────────────────────────────────────────────

window.__showDeviceHealth = async (deviceId) => {
  const modal = document.getElementById("deviceHealthModal");
  const content = document.getElementById("healthModalContent");
  const closeBtn = document.getElementById("closeHealthModalBtn");
  if (!modal || !content) return;

  if (closeBtn) closeBtn.onclick = () => modal.classList.remove("open");
  modal.onclick = (e) => { if (e.target === modal) modal.classList.remove("open"); };

  modal.classList.add("open");
  content.innerHTML = `<div style="color:var(--text-dim); text-align:center; padding:20px;">Gathering deep telemetry from device...</div>`;

  try {
    const res = await api(`/api/device/health/${deviceId}`);
    if (res.status === "success") {
      content.innerHTML = `
        <div class="health-telemetry-row">
          <span style="color:var(--text-dim); font-size:13px;">Target Device</span>
          <span style="color:#fff; font-weight:700; font-family:'JetBrains Mono'">${res.name} (${res.ip})</span>
        </div>
        <div class="health-telemetry-row">
          <span style="color:var(--text-dim); font-size:13px;">Platform & OS</span>
          <span style="color:var(--cyan); font-weight:700; font-family:'JetBrains Mono'">${res.version}</span>
        </div>
        <div class="health-telemetry-row">
          <span style="color:var(--text-dim); font-size:13px;">Hardware & Architecture</span>
          <span style="color:#fff; font-family:'JetBrains Mono'">${res.brand || ''} ${res.model} (${res.abi})</span>
        </div>
        <div class="health-telemetry-row">
          <span style="color:var(--text-dim); font-size:13px;">Root / Privilege Status</span>
          <span style="color:${(res.root_status || '').includes('Rooted') ? '#3ddc84' : '#ffd60a'}; font-weight:700; font-family:'JetBrains Mono'">${res.root_status}</span>
        </div>
        <div class="health-telemetry-row">
          <span style="color:var(--text-dim); font-size:13px;">SELinux Security Mode</span>
          <span style="color:${res.selinux === 'Enforcing' ? '#3ddc84' : '#ff6b6b'}; font-weight:700; font-family:'JetBrains Mono'">${res.selinux}</span>
        </div>
        <div class="health-telemetry-row">
          <span style="color:var(--text-dim); font-size:13px;">Battery Power</span>
          <span style="color:#fff; font-family:'JetBrains Mono'">${res.battery}</span>
        </div>
      `;
    } else {
      content.innerHTML = `<div style="color:var(--red); padding:20px;">Failed to gather health: ${res.message}</div>`;
    }
  } catch (err) {
    content.innerHTML = `<div style="color:var(--red); padding:20px;">Error: ${err.message}</div>`;
  }
};

// ─────────────────────────────────────────────────────────────
// Smart Logcat Filter Handler
// ─────────────────────────────────────────────────────────────

window.__filterLogcat = (term) => {
  const filterInput = document.getElementById("logcatFilterText");
  if (filterInput) {
    filterInput.value = term;
    toast(`Logcat filter applied: ${term || "All"}`);
  }
};

// ─────────────────────────────────────────────────────────────
// Evidence Vault Page Handler
// ─────────────────────────────────────────────────────────────

async function renderVaultPage() {
  const vaultGrid = document.getElementById("vaultGrid");
  const vaultSearchInput = document.getElementById("vaultSearchInput");
  const vaultCategoryFilter = document.getElementById("vaultCategoryFilter");
  const addVaultItemBtn = document.getElementById("addVaultItemBtn");
  const vaultModal = document.getElementById("vaultModal");
  const closeVaultModalBtn = document.getElementById("closeVaultModalBtn");
  const cancelVaultModalBtn = document.getElementById("cancelVaultModalBtn");
  const vaultForm = document.getElementById("vaultForm");

  let allEvidence = [];

  const loadEvidence = async () => {
    try {
      const res = await api("/api/vault");
      if (res.status === "success") {
        allEvidence = res.items || [];
        renderList();
      }
    } catch (err) {
      toast("Failed to load evidence vault: " + err.message);
    }
  };

  const renderList = () => {
    if (!vaultGrid) return;
    const query = (vaultSearchInput?.value || "").toLowerCase();
    const cat = vaultCategoryFilter?.value || "";

    const filtered = allEvidence.filter(item => {
      const matchesQuery = !query ||
        item.title.toLowerCase().includes(query) ||
        (item.content || "").toLowerCase().includes(query) ||
        (item.package || "").toLowerCase().includes(query) ||
        (item.tags || []).some(t => t.toLowerCase().includes(query));
      const matchesCat = !cat || item.category === cat;
      return matchesQuery && matchesCat;
    });

    if (!filtered.length) {
      vaultGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-dim);">No evidence entries found in vault. Click "+ Add Evidence" above.</div>`;
      return;
    }

    vaultGrid.innerHTML = filtered.map(item => `
      <div class="vault-card">
        <div class="vault-card-header">
          <div>
            <div class="vault-card-title">${item.title}</div>
            <div style="font-size:11px; color:var(--text-dim); margin-top:2px;">${item.category} • ${item.package || 'Global'} • ${item.created_at}</div>
          </div>
          <button type="button" class="quick-chip-btn" style="color:#ff6b6b; border-color:rgba(255,59,48,0.3);" onclick="window.__deleteVaultItem('${item.id}')">Delete</button>
        </div>

        ${(item.tags && item.tags.length) ? `
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${item.tags.map(t => `<span class="vault-tag">#${t}</span>`).join('')}
          </div>
        ` : ''}

        <div class="vault-code-block">${item.content}</div>

        <div style="display:flex; justify-content:flex-end;">
          <button type="button" class="quick-chip-btn" onclick="window.__copyText('${(item.content || '').replace(/'/g, "\\'")}')">Copy Data</button>
        </div>
      </div>
    `).join("");
  };

  window.__deleteVaultItem = async (id) => {
    if (!confirm("Remove this evidence item from vault?")) return;
    try {
      const res = await api(`/api/vault/${id}`, { method: "DELETE" });
      toast(res.message || "Deleted");
      await loadEvidence();
    } catch (e) {
      toast("Error deleting: " + e.message);
    }
  };

  if (vaultSearchInput) vaultSearchInput.oninput = renderList;
  if (vaultCategoryFilter) vaultCategoryFilter.onchange = renderList;

  if (addVaultItemBtn && vaultModal) {
    addVaultItemBtn.onclick = () => vaultModal.classList.add("open");
    if (closeVaultModalBtn) closeVaultModalBtn.onclick = () => vaultModal.classList.remove("open");
    if (cancelVaultModalBtn) cancelVaultModalBtn.onclick = () => vaultModal.classList.remove("open");
    vaultModal.onclick = (e) => { if (e.target === vaultModal) vaultModal.classList.remove("open"); };
  }

  if (vaultForm) {
    vaultForm.onsubmit = async (e) => {
      e.preventDefault();
      const title = document.getElementById("vaultTitle").value.trim();
      const category = document.getElementById("vaultCategory").value;
      const package_name = document.getElementById("vaultPackage").value.trim();
      const tags = document.getElementById("vaultTags").value.split(",").map(t => t.trim()).filter(Boolean);
      const content = document.getElementById("vaultContent").value;

      try {
        const res = await api("/api/vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, category, package: package_name, tags, content })
        });
        toast(res.message || "Evidence stored in vault");
        vaultModal.classList.remove("open");
        vaultForm.reset();
        await loadEvidence();
      } catch (err) {
        toast("Failed to store evidence: " + err.message);
      }
    };
  }

  await loadEvidence();
}

// ─────────────────────────────────────────────────────────────
// OWASP MASVS Checklist Page Handler
// ─────────────────────────────────────────────────────────────

async function renderMasvsPage() {
  const masvsPackageInput = document.getElementById("masvsPackageInput");
  const loadMasvsBtn = document.getElementById("loadMasvsBtn");
  const saveMasvsChecklistBtn = document.getElementById("saveMasvsChecklistBtn");
  const exportMasvsHtmlBtn = document.getElementById("exportMasvsHtmlBtn");
  const masvsChecklistContainer = document.getElementById("masvsChecklistContainer");
  const masvsPassCount = document.getElementById("masvsPassCount");
  const masvsFailCount = document.getElementById("masvsFailCount");
  const masvsNtCount = document.getElementById("masvsNtCount");

  let currentChecklist = [];

  const updateScores = () => {
    const passed = currentChecklist.filter(c => c.status === "PASS").length;
    const failed = currentChecklist.filter(c => c.status === "FAIL").length;
    const nt = currentChecklist.filter(c => c.status === "NOT_TESTED").length;

    if (masvsPassCount) masvsPassCount.textContent = `${passed} Passed`;
    if (masvsFailCount) masvsFailCount.textContent = `${failed} Failed`;
    if (masvsNtCount) masvsNtCount.textContent = `${nt} Not Tested`;
  };

  const renderChecklist = () => {
    if (!masvsChecklistContainer) return;
    masvsChecklistContainer.innerHTML = currentChecklist.map((item, idx) => `
      <div class="masvs-item-card">
        <div class="masvs-item-header">
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="masvs-item-id">${item.id}</span>
            <span class="vuln-badge medium">${item.category}</span>
          </div>
          <select class="masvs-status-select" onchange="window.__changeMasvsStatus(${idx}, this.value)">
            <option value="NOT_TESTED" ${item.status === 'NOT_TESTED' ? 'selected' : ''}>NOT TESTED</option>
            <option value="PASS" ${item.status === 'PASS' ? 'selected' : ''} style="color:#3ddc84;">PASS (Compliant)</option>
            <option value="FAIL" ${item.status === 'FAIL' ? 'selected' : ''} style="color:#ff453a;">FAIL (Vulnerable)</option>
          </select>
        </div>

        <div>
          <div style="font-weight:700; color:#fff; font-size:14px;">${item.title}</div>
          <div style="color:var(--text-dim); font-size:12px; margin-top:2px;">${item.description}</div>
        </div>

        <div>
          <input placeholder="Auditor assessment notes / testing proof..." value="${item.notes || ''}" style="width:100%; font-size:12px; padding:8px 12px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.08); border-radius:6px; color:#fff;" onchange="window.__changeMasvsNotes(${idx}, this.value)" />
        </div>
      </div>
    `).join("");

    updateScores();
  };

  window.__changeMasvsStatus = (idx, status) => {
    if (currentChecklist[idx]) {
      currentChecklist[idx].status = status;
      updateScores();
    }
  };

  window.__changeMasvsNotes = (idx, notes) => {
    if (currentChecklist[idx]) {
      currentChecklist[idx].notes = notes;
    }
  };

  const loadAssessment = async () => {
    const pkg = masvsPackageInput?.value.trim() || "default_app";
    try {
      const res = await api(`/api/masvs/checklist?package=${pkg}`);
      currentChecklist = res.checklist || [];
      renderChecklist();
      toast(`Loaded MASVS assessment for ${pkg}`);
    } catch (e) {
      toast("Error loading MASVS checklist: " + e.message);
    }
  };

  if (loadMasvsBtn) loadMasvsBtn.onclick = loadAssessment;

  if (saveMasvsChecklistBtn) {
    saveMasvsChecklistBtn.onclick = async () => {
      const pkg = masvsPackageInput?.value.trim() || "default_app";
      try {
        const res = await api("/api/masvs/checklist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ package: pkg, checklist: currentChecklist })
        });
        toast(res.message || "MASVS assessment saved successfully");
      } catch (e) {
        toast("Failed to save MASVS checklist: " + e.message);
      }
    };
  }

  if (exportMasvsHtmlBtn) {
    exportMasvsHtmlBtn.onclick = () => {
      const pkg = masvsPackageInput?.value.trim() || "default_app";
      window.location.href = `/api/masvs/export?package=${pkg}`;
    };
  }

  await loadAssessment();
}

function bootstrap() {
  attachSocketListeners();
  const page = getPage();
  if (page === "dashboard") renderDashboard();
  if (page === "devices") renderDevicesPage();
  if (page === "apps") renderAppsPage();
  if (page === "vault") renderVaultPage();
  if (page === "masvs") renderMasvsPage();

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

