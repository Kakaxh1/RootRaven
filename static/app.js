const socket = typeof io !== "undefined" ? io() : null;
let debugLines = [];
let sshSessionId = null;
let currentApps = [];
let appsPage = 1;
const APPS_PAGE_SIZE = 5;

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
}

async function renderDashboard() {
  const cards = document.getElementById("deviceCards");
  if (!cards) return;

  let filter = "all";
  const devices = await getDevices();

  const rerender = () => {
    cards.innerHTML = "";
    devices
      .filter((d) => filter === "all" || d.type === filter)
      .forEach((device) => {
        const card = document.createElement("div");
        card.className = "device-card";
        const iconClass = device.type === "android" ? "icon-android" : "icon-ios";
        const typeChip = device.type === "android" ? "ANDROID" : "IOS";
        card.innerHTML = `<div class="device-meta"><span class="device-icon ${iconClass}"></span><div><b>${device.name}</b> <span class="type-chip">${typeChip}</span><br><span class="mono"><span class="small-icon icon-device"></span>${device.ip}</span></div></div>`;

        const actions = document.createElement("div");
        actions.className = "inline-actions";
        if (device.type === "android") {
          actions.appendChild(actionButton("Connect", () => connectDevice(device)));
          actions.appendChild(actionButton("Install App (APK)", () => installAppToDevice(device)));
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
}

async function renderDevicesPage() {
  const form = document.getElementById("deviceForm");
  const wrap = document.getElementById("deviceTableWrap");
  if (!form || !wrap) return;

  const idField = document.getElementById("deviceId");
  const nameField = document.getElementById("deviceName");
  const ipField = document.getElementById("deviceIp");
  const typeField = document.getElementById("deviceType");
  const descField = document.getElementById("deviceDescription");
  const sshIdField = document.getElementById("deviceSshId");
  const sshPassField = document.getElementById("deviceSshPass");
  const updatePlaceholders = () => {
    if (typeField.value === "ios") {
      nameField.placeholder = "iOS device name (e.g. iPhone 14)";
      ipField.placeholder = "iOS IP/host (e.g. 192.168.1.120)";
    } else {
      nameField.placeholder = "Android device name (e.g. Pixel 7)";
      ipField.placeholder = "Android IP (e.g. 192.168.1.101)";
    }
  };
  typeField.onchange = updatePlaceholders;
  updatePlaceholders();

  const paint = async () => {
    const devices = await getDevices();
    if (!devices.length) {
      wrap.innerHTML = "<p>No devices saved yet.</p>";
      return;
    }
    const rows = devices
      .map(
        (d) =>
          `<tr>
             <td>${d.name}</td>
             <td class="mono">${d.ip}</td>
             <td>${d.type}</td>
             <td style="color:var(--text-dim); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${d.description || ''}</td>
             <td>
               <button onclick="window.__editDevice('${d.id}')">Edit</button>
               <button onclick="window.__deleteDevice('${d.id}')">Delete</button>
             </td>
           </tr>`
      )
      .join("");
    wrap.innerHTML = `<table><thead><tr><th>Name</th><th>IP</th><th>Type</th><th>Description</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`;

    window.__editDevice = (id) => {
      const device = devices.find((d) => d.id === id);
      if (!device) return;
      idField.value = device.id;
      nameField.value = device.name;
      ipField.value = device.ip;
      typeField.value = device.type;
      descField.value = device.description || "";
      sshIdField.value = device.ssh_id || "";
      sshPassField.value = device.ssh_pass || "";
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
      name: nameField.value,
      ip: ipField.value,
      type: typeField.value,
      description: descField.value,
      ssh_id: sshIdField.value,
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
    form.reset();
    idField.value = "";
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
          <button onclick="window.__objection('${a.package}')">Objection</button>
        </div>
      </div>`
    )
    .join("");

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

  const debugOverlay = document.getElementById("globalDebugOverlay");
  const openDebugBtn = document.getElementById("openDebugBtn");
  const toggleDebugBtn = document.getElementById("toggleDebugBtn");

  if (openDebugBtn && debugOverlay && toggleDebugBtn) {
    openDebugBtn.onclick = () => {
      debugOverlay.style.display = "flex";
      openDebugBtn.style.display = "none";
    };
    toggleDebugBtn.onclick = () => {
      debugOverlay.style.display = "none";
      openDebugBtn.style.display = "block";
    };
  }
}

bootstrap();
