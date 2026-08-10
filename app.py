import os
import socket
import subprocess
import tempfile
import threading
import time
import uuid


import paramiko
import requests
from flask import Flask, jsonify, render_template, request
from flask_socketio import SocketIO, emit
from werkzeug.utils import secure_filename

from utils.adb_helper import ADBHelper
from utils.device_manager import DeviceManager
from utils.frida_manager import FridaManager

app = Flask(__name__)
app.config["SECRET_KEY"] = "mobile-security-testing-tool"
socketio = SocketIO(app, cors_allowed_origins="*", manage_session=False)

import logging
class SocketIOLogHandler(logging.Handler):
    def emit(self, record):
        try:
            msg = self.format(record)
            socketio.emit("debug_log", {"source": "SYSTEM", "message": msg})
        except Exception:
            pass

sock_handler = SocketIOLogHandler()
sock_handler.setFormatter(logging.Formatter('%(levelname)s: %(message)s'))
logging.getLogger().addHandler(sock_handler)
logging.getLogger("werkzeug").addHandler(sock_handler)
app.logger.addHandler(sock_handler)

device_manager = DeviceManager()
frida_manager = FridaManager()
adb_helper = ADBHelper()
SSH_SESSIONS = {}
ADB_SESSIONS = {}
RUNNING_FRIDA_PROCESSES = {}
RUNNING_LOGCAT_PROCESSES = {}

UPLOAD_FOLDER = os.path.join(tempfile.gettempdir(), "mobile_uploads")
DECOMPILE_FOLDER = os.path.join(tempfile.gettempdir(), "mobile_decompiled")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(DECOMPILE_FOLDER, exist_ok=True)

COMMAND_REFERENCE = {
    "android": {
        "SSL Pinning Bypass": "android sslpinning disable",
        "Dump Keychain/Tokens": "android keychain dump",
        "Dump App Settings": "android sharedpreferences get",
        "Dump Cookies": "android cookies get",
        "Download Database": "file download /data/data/*/*.db",
        "Search Memory for PAN": 'memory search "CLHPN"',
        "Get App Paths": "env",
    },
    "ios": {
        "SSL Pinning Bypass": "ios sslpinning disable",
        "Dump Keychain/Tokens": "ios keychain dump",
        "Dump App Settings": "ios nsuserdefaults get",
        "Dump Cookies": "ios cookies get",
        "Download Database": "file download Documents/*.db",
        "Search Memory for PAN": 'memory search "CLHPN"',
        "Get App Paths": "env",
    },
}


def _local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/devices")
def devices_page():
    return render_template("devices.html")


@app.route("/apps")
def apps_page():
    return render_template("apps.html")


@app.route("/api/devices", methods=["GET"])
def get_devices():
    return jsonify(device_manager.get_all_devices())


@app.route("/api/devices", methods=["POST"])
def add_device():
    data = request.json or {}
    return jsonify(device_manager.add_device(data))


@app.route("/api/devices/<device_id>", methods=["PUT"])
def update_device(device_id):
    data = request.json or {}
    result = device_manager.update_device(device_id, data)
    if result.get("status") == "error":
        return jsonify(result), 404
    return jsonify(result)


@app.route("/api/devices/<device_id>", methods=["DELETE"])
def delete_device(device_id):
    result = device_manager.delete_device(device_id)
    if result.get("status") == "error":
        return jsonify(result), 404
    return jsonify(result)


@app.route("/api/devices/<device_id>/connect", methods=["POST"])
def connect_device(device_id):
    device = device_manager.get_device(device_id)
    if not device:
        return jsonify({"status": "error", "message": "Device not found"}), 404
    if device["type"] == "android":
        return jsonify(adb_helper.connect_device(device["ip"]))
    return jsonify({"status": "success", "message": "iOS device ready"})


@app.route("/api/upload", methods=["POST"])
def upload_file():
    local_path = None
    try:
        device_id = request.form.get("device_id")
        remote_path = request.form.get("remote_path", "")
        if "file" not in request.files:
            return jsonify({"status": "error", "message": "No file selected"}), 400

        upload = request.files["file"]
        if upload.filename == "":
            return jsonify({"status": "error", "message": "No file selected"}), 400

        device = device_manager.get_device(device_id)
        if not device:
            return jsonify({"status": "error", "message": "Device not found"}), 404

        filename = secure_filename(upload.filename)
        local_path = os.path.join(UPLOAD_FOLDER, filename)
        upload.save(local_path)

        if device["type"] == "android":
            result = adb_helper.upload_file_android(device, local_path, remote_path)
        else:
            result = {
                "status": "info",
                "message": (
                    "Use iOS file uploader at "
                    f"http://{device['ip']}:{device.get('file_upload_port', 11111)}"
                ),
            }
        return jsonify(result)
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500
    finally:
        if local_path and os.path.exists(local_path):
            os.remove(local_path)


@app.route("/api/install-apk", methods=["POST"])
def install_apk():
    local_path = None
    try:
        device_id = request.form.get("device_id")
        if "file" not in request.files:
            return jsonify({"status": "error", "message": "No APK selected"}), 400
        upload = request.files["file"]
        if upload.filename == "":
            return jsonify({"status": "error", "message": "No APK selected"}), 400

        device = device_manager.get_device(device_id)
        if not device:
            return jsonify({"status": "error", "message": "Device not found"}), 404
        if device["type"] != "android":
            return jsonify({"status": "error", "message": "APK install is Android-only"}), 400

        filename = secure_filename(upload.filename)
        if not filename.lower().endswith(".apk"):
            return jsonify({"status": "error", "message": "Only .apk files are supported"}), 400

        local_path = os.path.join(UPLOAD_FOLDER, filename)
        upload.save(local_path)
        result = adb_helper.install_apk_android(device, local_path)
        code = 200 if result.get("status") == "success" else 500
        return jsonify(result), code
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500
    finally:
        if local_path and os.path.exists(local_path):
            os.remove(local_path)


@app.route("/api/install-ipa", methods=["POST"])
def install_ipa():
    try:
        device_id = request.form.get("device_id")
        if "file" not in request.files:
            return jsonify({"status": "error", "message": "No IPA selected"}), 400
        upload = request.files["file"]
        if upload.filename == "":
            return jsonify({"status": "error", "message": "No IPA selected"}), 400

        device = device_manager.get_device(device_id)
        if not device:
            return jsonify({"status": "error", "message": "Device not found"}), 404
        if device["type"] != "ios":
            return jsonify({"status": "error", "message": "IPA install is iOS-only"}), 400
        if not upload.filename.lower().endswith(".ipa"):
            return jsonify({"status": "error", "message": "Only .ipa files are supported"}), 400

        ip = device["ip"]
        url = f"http://{ip}:11111/var/tmp/?action=install&path=%2Fvar%2Fmobile%2FDownloads%2F"
        headers = {
            "X-Requested-With": "XMLHttpRequest",
            "Origin": f"http://{ip}:11111",
            "Referer": f"http://{ip}:11111/var/mobile/Downloads/",
        }
        files = {"newfile": (upload.filename, upload.stream, "application/octet-stream")}
        data = {
            "mode": "add",
            "currentpath": "/var/mobile/Downloads/",
            "filepath": "",
        }
        response = requests.post(url, headers=headers, data=data, files=files, timeout=120)
        body = response.text.strip()
        if response.ok:
            return jsonify(
                {
                    "status": "success",
                    "message": "IPA uploaded and install request triggered on iOS device",
                    "response": body[:1000],
                }
            )
        return (
            jsonify(
                {
                    "status": "error",
                    "message": f"Filza install request failed with status {response.status_code}",
                    "response": body[:1000],
                }
            ),
            500,
        )
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500


@app.route("/api/devices/<device_id>/files", methods=["GET"])
def browse_android_files(device_id):
    device = device_manager.get_device(device_id)
    if not device:
        return jsonify({"status": "error", "message": "Device not found"}), 404
    if device["type"] != "android":
        return jsonify({"status": "error", "message": "File listing API is Android-only"}), 400
    remote_path = request.args.get("path", "/sdcard")
    result = adb_helper.list_files_android(device, remote_path)
    code = 200 if result.get("status") == "success" else 500
    return jsonify(result), code


@app.route("/api/ssh/execute", methods=["POST"])
def execute_ssh_command():
    payload = request.json or {}
    host = (payload.get("ip") or "").strip()
    port = int(payload.get("port") or 22)
    username = (payload.get("id") or "").strip()
    password = payload.get("pass") or ""
    command = (payload.get("command") or "").strip()

    if not host or not username or not password or not command:
        return jsonify({"status": "error", "message": "ip, port, id, pass, command are required"}), 400

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(hostname=host, port=port, username=username, password=password, timeout=12)
        stdin, stdout, stderr = client.exec_command(command, timeout=20)
        out = stdout.read().decode("utf-8", errors="ignore").strip()
        err = stderr.read().decode("utf-8", errors="ignore").strip()
        output = out or err or "(no output)"
        status = "success" if out or not err else "error"
        return jsonify({"status": status, "output": output})
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500
    finally:
        client.close()


@app.route("/api/ssh/connect", methods=["POST"])
def ssh_connect():
    payload = request.json or {}
    host = (payload.get("ip") or "").strip()
    port = int(payload.get("port") or 22)
    username = (payload.get("id") or "").strip()
    password = payload.get("pass") or ""
    if not host or not username or not password:
        return jsonify({"status": "error", "message": "ip, port, id, pass are required"}), 400

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(hostname=host, port=port, username=username, password=password, timeout=12)
        channel = client.invoke_shell()
        time.sleep(0.3)
        banner = ""
        while channel.recv_ready():
            banner += channel.recv(4096).decode("utf-8", errors="ignore")
        session_id = str(uuid.uuid4())
        SSH_SESSIONS[session_id] = {
            "client": client,
            "channel": channel,
        }
        return jsonify({"status": "success", "session_id": session_id, "output": banner or "Connected"})
    except Exception as exc:
        try:
            client.close()
        except Exception:
            pass
        return jsonify({"status": "error", "message": str(exc)}), 500


@app.route("/api/ssh/send", methods=["POST"])
def ssh_send():
    payload = request.json or {}
    session_id = payload.get("session_id")
    command = (payload.get("command") or "").strip()
    if not session_id or not command:
        return jsonify({"status": "error", "message": "session_id and command are required"}), 400
    session = SSH_SESSIONS.get(session_id)
    if not session:
        return jsonify({"status": "error", "message": "SSH session not found"}), 404

    try:
        channel = session["channel"]
        channel.send(command + "\n")
        time.sleep(0.35)
        output = ""
        while channel.recv_ready():
            output += channel.recv(4096).decode("utf-8", errors="ignore")
        return jsonify({"status": "success", "output": output or "(no output)"})
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500


@app.route("/api/ssh/disconnect", methods=["POST"])
def ssh_disconnect():
    payload = request.json or {}
    session_id = payload.get("session_id")
    if not session_id:
        return jsonify({"status": "error", "message": "session_id is required"}), 400
    session = SSH_SESSIONS.pop(session_id, None)
    if not session:
        return jsonify({"status": "error", "message": "SSH session not found"}), 404
    try:
        session["channel"].close()
    except Exception:
        pass
    try:
        session["client"].close()
    except Exception:
        pass
    return jsonify({"status": "success", "message": "SSH disconnected"})


@app.route("/api/commands/<device_type>", methods=["GET"])
def command_reference(device_type):
    return jsonify(COMMAND_REFERENCE.get(device_type.lower(), {}))


@app.route("/api/proxy-info", methods=["GET"])
def proxy_info():
    return jsonify(
        {
            "pc_ip": _local_ip(),
            "wifi_proxy": "Set device WiFi proxy to {pc_ip}:8080",
            "burp_listener": "Configure Burp listener on 0.0.0.0:8080",
        }
    )


@app.route("/api/scripts", methods=["GET"])
def list_frida_scripts():
    return jsonify(frida_manager.get_scripts())


@app.route("/api/scripts", methods=["POST"])
def save_frida_script():
    payload = request.json or {}
    name = payload.get("name", "").strip()
    content = payload.get("content", "")
    if not name or not content:
        return jsonify({"status": "error", "message": "name and content are required"}), 400
    return jsonify(frida_manager.save_script(name, content))


@app.route("/api/scripts/<name>", methods=["DELETE"])
def delete_frida_script(name):
    return jsonify(frida_manager.delete_script(name))


@app.route("/api/cert/install", methods=["POST"])
def install_ca_certificate():
    local_path = None
    try:
        device_id = request.form.get("device_id")
        if "file" not in request.files:
            return jsonify({"status": "error", "message": "No certificate file uploaded"}), 400
        upload = request.files["file"]
        if upload.filename == "":
            return jsonify({"status": "error", "message": "No file selected"}), 400
        
        device = device_manager.get_device(device_id)
        if not device:
            return jsonify({"status": "error", "message": "Device not found"}), 404
        if device["type"] != "android":
            return jsonify({"status": "error", "message": "CA installation is Android-only"}), 400
            
        filename = secure_filename(upload.filename)
        local_path = os.path.join(UPLOAD_FOLDER, filename)
        upload.save(local_path)
        
        result = adb_helper.install_ca_cert_android(device, local_path)
        return jsonify(result)
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500
    finally:
        if local_path and os.path.exists(local_path):
            os.remove(local_path)


@app.route("/api/device/db/list", methods=["GET"])
def list_app_databases():
    device_id = request.args.get("device_id")
    package = request.args.get("package")
    if not device_id or not package:
        return jsonify({"status": "error", "message": "device_id and package are required"}), 400
    device = device_manager.get_device(device_id)
    if not device:
        return jsonify({"status": "error", "message": "Device not found"}), 404
    if device["type"] != "android":
        return jsonify({"status": "error", "message": "Storage listing is Android-only"}), 400
    return jsonify(adb_helper.list_app_files_android(device, package))


@app.route("/api/device/db/query", methods=["POST"])
def query_app_database():
    payload = request.json or {}
    device_id = payload.get("device_id")
    package = payload.get("package")
    db_path = payload.get("db_path")
    sql = payload.get("sql", "").strip()
    if not device_id or not package or not db_path or not sql:
        return jsonify({"status": "error", "message": "device_id, package, db_path, and sql are required"}), 400
    device = device_manager.get_device(device_id)
    if not device:
        return jsonify({"status": "error", "message": "Device not found"}), 404
    return jsonify(adb_helper.query_db_android(device, package, db_path, sql))


@app.route("/api/device/pref/read", methods=["GET"])
def read_shared_preference():
    device_id = request.args.get("device_id")
    package = request.args.get("package")
    pref_path = request.args.get("pref_path")
    if not device_id or not package or not pref_path:
        return jsonify({"status": "error", "message": "device_id, package, and pref_path are required"}), 400
    device = device_manager.get_device(device_id)
    if not device:
        return jsonify({"status": "error", "message": "Device not found"}), 404
    return jsonify(adb_helper.read_shared_pref_android(device, package, pref_path))


@app.route("/api/adb/connect", methods=["POST"])
def adb_shell_connect():
    payload = request.json or {}
    device_id = payload.get("device_id")
    if not device_id:
        return jsonify({"status": "error", "message": "device_id is required"}), 400
    device = device_manager.get_device(device_id)
    if not device:
        return jsonify({"status": "error", "message": "Device not found"}), 404
    if device["type"] != "android":
        return jsonify({"status": "error", "message": "ADB shell is Android-only"}), 400

    target = adb_helper.get_target(device)

    session_id = str(uuid.uuid4())
    cmd = f'adb -s {target} shell'
    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=0,
            shell=True
        )
        
        import queue
        q = queue.Queue()

        def enqueue_output(out, queue_obj):
            try:
                while True:
                    char = out.read(1)
                    if not char:
                        break
                    queue_obj.put(char)
            except Exception:
                pass
            finally:
                try:
                    out.close()
                except Exception:
                    pass

        t = threading.Thread(target=enqueue_output, args=(proc.stdout, q), daemon=True)
        t.start()
        
        time.sleep(0.35)
        
        banner = ""
        while not q.empty():
            try:
                banner += q.get_nowait()
            except queue.Empty:
                break

        ADB_SESSIONS[session_id] = {
            "proc": proc,
            "queue": q,
            "device_id": device_id
        }
        return jsonify({"status": "success", "session_id": session_id, "output": banner.strip() or "Connected to ADB shell"})
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500


@app.route("/api/adb/send", methods=["POST"])
def adb_shell_send():
    payload = request.json or {}
    session_id = payload.get("session_id")
    command = payload.get("command", "").strip()
    if not session_id or not command:
        return jsonify({"status": "error", "message": "session_id and command are required"}), 400
    session = ADB_SESSIONS.get(session_id)
    if not session:
        return jsonify({"status": "error", "message": "ADB session not found"}), 404

    proc = session["proc"]
    q = session["queue"]
    try:
        proc.stdin.write(command + "\n")
        proc.stdin.flush()
        time.sleep(0.4)
        
        output = ""
        while not q.empty():
            try:
                output += q.get_nowait()
            except queue.Empty:
                break
        return jsonify({"status": "success", "output": output or "(no output)"})
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500


@app.route("/api/adb/disconnect", methods=["POST"])
def adb_shell_disconnect():
    payload = request.json or {}
    session_id = payload.get("session_id")
    if not session_id:
        return jsonify({"status": "error", "message": "session_id is required"}), 400
    session = ADB_SESSIONS.pop(session_id, None)
    if not session:
        return jsonify({"status": "error", "message": "ADB session not found"}), 404
    try:
        session["proc"].terminate()
        session["proc"].wait(timeout=2)
    except Exception:
        pass
    return jsonify({"status": "success", "message": "ADB shell disconnected"})


@app.route("/api/decompile/upload", methods=["POST"])
def decompile_apk_upload():
    local_path = None
    try:
        if "file" not in request.files:
            return jsonify({"status": "error", "message": "No APK file uploaded"}), 400
        upload = request.files["file"]
        if upload.filename == "":
            return jsonify({"status": "error", "message": "No file selected"}), 400
        if not upload.filename.lower().endswith(".apk"):
            return jsonify({"status": "error", "message": "Only .apk files are supported"}), 400

        filename = secure_filename(upload.filename)
        local_path = os.path.join(UPLOAD_FOLDER, filename)
        upload.save(local_path)

        # Output folder for decompile
        out_name = os.path.splitext(filename)[0]
        out_dir = os.path.join(DECOMPILE_FOLDER, out_name)
        os.makedirs(out_dir, exist_ok=True)

        # Trigger jadx in non-blocking thread
        def run_jadx(apk, dest):
            # Check JADX availability
            cmd = f'jadx -d "{dest}" "{apk}"'
            try:
                socketio.emit("debug_log", {"source": "DECOMPILER", "message": f"Starting decompilation of {os.path.basename(apk)}..."})
                proc = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=180)
                if proc.returncode == 0:
                    socketio.emit("debug_log", {"source": "DECOMPILER", "message": f"Decompilation complete! Saved to {dest}"})
                else:
                    socketio.emit("debug_log", {"source": "DECOMPILER", "message": f"Decompilation failed: {proc.stderr or proc.stdout}"})
            except Exception as exc:
                socketio.emit("debug_log", {"source": "DECOMPILER", "message": "Decompiler error: " + str(exc)})
            finally:
                if os.path.exists(apk):
                    try:
                        os.remove(apk)
                    except Exception:
                        pass

        threading.Thread(target=run_jadx, args=(local_path, out_dir), daemon=True).start()
        return jsonify({"status": "success", "message": "Decompilation triggered in background", "output_dir_name": out_name})
    except Exception as exc:
        if local_path and os.path.exists(local_path):
            os.remove(local_path)
        return jsonify({"status": "error", "message": str(exc)}), 500


@app.route("/api/decompile/tree", methods=["GET"])
def decompile_tree():
    dir_name = request.args.get("dir_name", "").strip()
    sub_path = request.args.get("path", "").strip()
    if not dir_name:
        return jsonify({"status": "error", "message": "dir_name is required"}), 400

    target_base = os.path.join(DECOMPILE_FOLDER, secure_filename(dir_name))
    if not os.path.exists(target_base):
        return jsonify({"status": "error", "message": "Decompiled directory not found"}), 404

    target_dir = os.path.normpath(os.path.join(target_base, sub_path))
    # Path traversal validation
    if not target_dir.startswith(target_base):
        return jsonify({"status": "error", "message": "Access denied"}), 403

    try:
        entries = []
        if os.path.exists(target_dir) and os.path.isdir(target_dir):
            for name in os.listdir(target_dir):
                full = os.path.join(target_dir, name)
                is_dir = os.path.isdir(full)
                rel = os.path.relpath(full, target_base).replace("\\", "/")
                entries.append({
                    "name": name,
                    "isDir": is_dir,
                    "path": rel
                })
        # Sort directories first
        entries.sort(key=lambda x: (not x["isDir"], x["name"].lower()))
        return jsonify({"status": "success", "entries": entries})
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500


@app.route("/api/decompile/file", methods=["GET"])
def decompile_file_read():
    dir_name = request.args.get("dir_name", "").strip()
    file_path = request.args.get("path", "").strip()
    if not dir_name or not file_path:
        return jsonify({"status": "error", "message": "dir_name and path are required"}), 400

    target_base = os.path.join(DECOMPILE_FOLDER, secure_filename(dir_name))
    target_file = os.path.normpath(os.path.join(target_base, file_path))
    # Path traversal validation
    if not target_file.startswith(target_base) or not os.path.isfile(target_file):
        return jsonify({"status": "error", "message": "Invalid file path or access denied"}), 403

    try:
        with open(target_file, "r", encoding="utf-8", errors="ignore") as fp:
            content = fp.read()
        return jsonify({"status": "success", "content": content})
    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500


@app.route("/api/device/memory/search", methods=["POST"])
def search_process_memory():
    payload = request.json or {}
    device_id = payload.get("device_id")
    package_name = payload.get("package_name")
    search_pattern = payload.get("pattern", "").strip()

    if not device_id or not package_name or not search_pattern:
        return jsonify({"status": "error", "message": "device_id, package_name, and pattern are required"}), 400

    device = device_manager.get_device(device_id)
    if not device:
        return jsonify({"status": "error", "message": "Device not found"}), 404

    # Connect device first if android
    if device["type"] == "android":
        adb_helper.connect_device(device["ip"])

    # Load template memory scanner script
    base_dir = os.path.dirname(__file__)
    template_path = os.path.join(base_dir, "data", "scripts", "memory_scanner.js")
    if not os.path.exists(template_path):
        return jsonify({"status": "error", "message": "Memory scanner Frida template script not found"}), 500

    try:
        with open(template_path, "r", encoding="utf-8") as fp:
            script_data = fp.read()
        
        # Inject search pattern safely
        script_data = script_data.replace("SEARCH_PATTERN_HERE", search_pattern)

        # Write to temporary file
        script_file = os.path.join(tempfile.gettempdir(), f"memscan_{uuid.uuid4().hex}.js")
        with open(script_file, "w", encoding="utf-8") as f:
            f.write(script_data)

        # Launch non-blocking Frida script to print scan results to system log stream
        cmd = f'frida -U --no-pause -f "{package_name}" -l "{script_file}"'
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            shell=True
        )

        # Track process to prevent execution leaks
        task_key = f"{device_id}_{package_name}_memscan"
        RUNNING_FRIDA_PROCESSES[task_key] = proc

        def read_scan_outputs(process, temp_path):
            try:
                for line in iter(process.stdout.readline, ""):
                    socketio.emit("debug_log", {"source": "MEMORY_SCAN", "message": line.strip()})
                process.stdout.close()
            except Exception:
                pass
            finally:
                try:
                    process.wait(timeout=2)
                except Exception:
                    pass
                if os.path.exists(temp_path):
                    try:
                        os.remove(temp_path)
                    except Exception:
                        pass

        threading.Thread(target=read_scan_outputs, args=(proc, script_file), daemon=True).start()
        return jsonify({"status": "success", "message": "Memory scanner script injected successfully. Watch Live Logs for matches."})

    except Exception as exc:
        return jsonify({"status": "error", "message": str(exc)}), 500


@socketio.on("start_http_server")
def handle_http_server(data):
    device = device_manager.get_device((data or {}).get("device_id"))
    if not device:
        emit("http_server_status", {"status": "error", "message": "Device not found"})
        return
    if device["type"] != "android":
        emit(
            "http_server_status",
            {
                "status": "info",
                "message": (
                    "Use iOS file upload at "
                    f"http://{device['ip']}:{device.get('file_upload_port', 11111)}"
                ),
            },
        )
        return
    result = adb_helper.start_http_server(device)
    emit("http_server_status", result)


@socketio.on("debug_http_server")
def handle_debug_http_server(data):
    device = device_manager.get_device((data or {}).get("device_id"))
    if not device:
        emit("debug_http_server_status", {"status": "error", "message": "Device not found"})
        return
    if device["type"] != "android":
        emit("debug_http_server_status", {"status": "error", "message": "Android-only debug action"})
        return
    result = adb_helper.debug_http_server_env(device)
    emit("debug_http_server_status", result)
    emit(
        "debug_log",
        {
            "source": "http_debug",
            "message": f"HTTP debug checks completed for {device['name']} ({device['ip']})",
        },
    )


@socketio.on("install_http_tools")
def handle_install_http_tools(data):
    device = device_manager.get_device((data or {}).get("device_id"))
    if not device:
        emit("install_http_tools_status", {"status": "error", "message": "Device not found"})
        return
    if device["type"] != "android":
        emit("install_http_tools_status", {"status": "error", "message": "Android-only install action"})
        return
    result = adb_helper.install_http_tools(device)
    emit("install_http_tools_status", result)
    emit(
        "debug_log",
        {
            "source": "install_http_tools",
            "message": result.get("message", "Install action completed"),
        },
    )


@socketio.on("start_frida_server")
def handle_frida_server(data):
    device = device_manager.get_device((data or {}).get("device_id"))
    if not device:
        emit("frida_server_status", {"status": "error", "message": "Device not found"})
        return
    if device["type"] == "android":
        emit("frida_server_status", adb_helper.start_frida_server(device))
    else:
        emit("frida_server_status", {"status": "success", "message": "Frida already running on iOS"})


@socketio.on("get_app_list")
def handle_get_apps(data):
    device = device_manager.get_device((data or {}).get("device_id"))
    if not device:
        emit("app_list", {"status": "error", "message": "Device not found", "apps": []})
        return
    apps = frida_manager.get_app_list(device)
    emit("app_list", {"status": "success", "apps": apps})


@socketio.on("launch_objection")
def handle_objection(data):
    payload = data or {}
    app_name = payload.get("app_name", "")
    device_id = payload.get("device_id")
    device = device_manager.get_device(device_id) if device_id else None
    emit("objection_status", frida_manager.launch_objection(app_name, device))


@socketio.on("bypass_ssl")
def handle_ssl_bypass(data):
    payload = data or {}
    emit(
        "ssl_bypass_status",
        frida_manager.bypass_ssl_pinning(payload.get("device_type", "android")),
    )


@socketio.on("run_frida_script")
def handle_run_frida_script(data):
    payload = data or {}
    device_id = payload.get("device_id")
    package_name = payload.get("package_name")
    script_content = payload.get("script_content")

    device = device_manager.get_device(device_id)
    if not device:
        emit("frida_script_status", {"status": "error", "message": "Device not found"})
        return

    task_key = f"{device_id}_{package_name}"
    if task_key in RUNNING_FRIDA_PROCESSES:
        try:
            RUNNING_FRIDA_PROCESSES[task_key].terminate()
        except Exception:
            pass
        RUNNING_FRIDA_PROCESSES.pop(task_key, None)

    if device["type"] == "android":
        adb_helper.connect_device(device["ip"])

    script_file = os.path.join(tempfile.gettempdir(), f"hook_{uuid.uuid4().hex}.js")
    try:
        with open(script_file, "w", encoding="utf-8") as f:
            f.write(script_content)
    except Exception as exc:
        emit("frida_script_status", {"status": "error", "message": "Failed to create temp script: " + str(exc)})
        return

    cmd = f'frida -U --no-pause -f "{package_name}" -l "{script_file}"'
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            shell=True
        )
        RUNNING_FRIDA_PROCESSES[task_key] = proc
        emit("frida_script_status", {"status": "success", "message": "Frida script injected successfully"})

        def read_outputs(process, temp_path):
            try:
                for line in iter(process.stdout.readline, ""):
                    socketio.emit("debug_log", {"source": "FRIDA_SCRIPT", "message": line.strip()})
                process.stdout.close()
            except Exception:
                pass
            finally:
                try:
                    process.wait(timeout=2)
                except Exception:
                    pass
                if os.path.exists(temp_path):
                    try:
                        os.remove(temp_path)
                    except Exception:
                        pass

        threading.Thread(target=read_outputs, args=(proc, script_file), daemon=True).start()

    except Exception as exc:
        if os.path.exists(script_file):
            try:
                os.remove(script_file)
            except Exception:
                pass
        emit("frida_script_status", {"status": "error", "message": "Failed to launch frida: " + str(exc)})


@socketio.on("stop_frida_script")
def handle_stop_frida_script(data):
    payload = data or {}
    device_id = payload.get("device_id")
    package_name = payload.get("package_name")
    task_key = f"{device_id}_{package_name}"
    proc = RUNNING_FRIDA_PROCESSES.pop(task_key, None)
    if proc:
        try:
            proc.terminate()
            emit("frida_script_status", {"status": "success", "message": "Frida script execution stopped"})
        except Exception as exc:
            emit("frida_script_status", {"status": "error", "message": "Error stopping process: " + str(exc)})
    else:
        emit("frida_script_status", {"status": "info", "message": "No active Frida script to stop"})


@socketio.on("start_logcat")
def handle_start_logcat(data):
    payload = data or {}
    device_id = payload.get("device_id")
    filter_text = payload.get("filter_text", "").strip()

    device = device_manager.get_device(device_id)
    if not device:
        emit("logcat_status", {"status": "error", "message": "Device not found"})
        return

    if device_id in RUNNING_LOGCAT_PROCESSES:
        try:
            RUNNING_LOGCAT_PROCESSES[device_id].terminate()
        except Exception:
            pass
        RUNNING_LOGCAT_PROCESSES.pop(device_id, None)

    target = device["ip"]
    if "." in target or ":" in target:
        target = f"{target}:5555"
        adb_helper.connect_device(device["ip"])

    cmd = f'adb -s {target} logcat -v time'
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            shell=True
        )
        RUNNING_LOGCAT_PROCESSES[device_id] = proc
        emit("logcat_status", {"status": "success", "message": "Logcat started"})

        def read_logcat(process, dev_id, flt):
            try:
                for line in iter(process.stdout.readline, ""):
                    cleaned_line = line.strip()
                    if not cleaned_line:
                        continue
                    if flt and flt.lower() not in cleaned_line.lower():
                        continue
                    socketio.emit("logcat_line", {"device_id": dev_id, "line": cleaned_line})
                process.stdout.close()
            except Exception:
                pass
            finally:
                try:
                    process.wait(timeout=2)
                except Exception:
                    pass

        threading.Thread(target=read_logcat, args=(proc, device_id, filter_text), daemon=True).start()

    except Exception as exc:
        emit("logcat_status", {"status": "error", "message": "Failed to start logcat: " + str(exc)})


@socketio.on("stop_logcat")
def handle_stop_logcat(data):
    payload = data or {}
    device_id = payload.get("device_id")
    proc = RUNNING_LOGCAT_PROCESSES.pop(device_id, None)
    if proc:
        try:
            proc.terminate()
            emit("logcat_status", {"status": "success", "message": "Logcat stopped"})
        except Exception as exc:
            emit("logcat_status", {"status": "error", "message": "Error stopping logcat: " + str(exc)})
    else:
        emit("logcat_status", {"status": "info", "message": "Logcat is not running"})





# ─────────────────────────────────────────────────────────────
# Frida Script Hub & Execution API
# ─────────────────────────────────────────────────────────────

@app.route("/api/scripts", methods=["GET", "POST"])
def manage_scripts():
    if request.method == "GET":
        return jsonify(frida_manager.get_scripts())
    payload = request.json or {}
    name = (payload.get("name") or "").strip()
    content = payload.get("content") or ""
    if not name:
        return jsonify({"status": "error", "message": "Script name is required"}), 400
    res = frida_manager.save_script(name, content)
    return jsonify(res)


@app.route("/api/scripts/<path:name>", methods=["DELETE"])
def delete_script(name):
    res = frida_manager.delete_script(name)
    return jsonify(res)


@socketio.on("run_frida_script")
def handle_run_frida_script(data):
    payload = data or {}
    device_id = payload.get("device_id")
    package_name = (payload.get("package_name") or "").strip()
    script_content = payload.get("script_content") or ""

    if not device_id or not package_name or not script_content:
        emit("frida_script_status", {"status": "error", "message": "Device, package name, and script content are required"})
        return

    device = device_manager.get_device(device_id)
    if not device:
        emit("frida_script_status", {"status": "error", "message": "Device not found"})
        return

    process_key = f"{device_id}_{package_name}"
    if process_key in RUNNING_FRIDA_PROCESSES:
        try:
            RUNNING_FRIDA_PROCESSES[process_key].terminate()
        except Exception:
            pass
        RUNNING_FRIDA_PROCESSES.pop(process_key, None)

    # Write script to temporary file for frida CLI execution
    temp_script_path = os.path.join(tempfile.gettempdir(), f"frida_hook_{uuid.uuid4().hex[:8]}.js")
    with open(temp_script_path, "w", encoding="utf-8") as fp:
        fp.write(script_content)

    # Determine connection argument for Frida
    target_ip = device.get("ip", "")
    is_usb = not target_ip or ("." not in target_ip and ":" not in target_ip)

    if is_usb:
        target_flag = "-U"
    else:
        # Check if USB serial or network target
        target_flag = f"-H {target_ip}:27042"

    cmd = f'frida {target_flag} -f {package_name} -l "{temp_script_path}" --no-pause'
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            shell=True
        )
        RUNNING_FRIDA_PROCESSES[process_key] = proc
        emit("frida_script_status", {"status": "success", "message": f"Injected script into {package_name}"})
        socketio.emit("debug_log", {"source": "FRIDA", "message": f"Started hook process for {package_name}"})

        def stream_frida_output(process, key, tmp_path):
            try:
                for line in iter(process.stdout.readline, ""):
                    cleaned = line.rstrip()
                    if cleaned:
                        socketio.emit("frida_script_output", {"line": cleaned})
                        socketio.emit("debug_log", {"source": "FRIDA", "message": cleaned})
                process.stdout.close()
            except Exception:
                pass
            finally:
                try:
                    process.wait(timeout=2)
                except Exception:
                    pass
                if os.path.exists(tmp_path):
                    try:
                        os.remove(tmp_path)
                    except Exception:
                        pass
                RUNNING_FRIDA_PROCESSES.pop(key, None)
                socketio.emit("frida_script_status", {"status": "info", "message": "Frida hook process ended"})

        threading.Thread(target=stream_frida_output, args=(proc, process_key, temp_script_path), daemon=True).start()

    except Exception as exc:
        emit("frida_script_status", {"status": "error", "message": "Failed to launch Frida: " + str(exc)})


@socketio.on("stop_frida_script")
def handle_stop_frida_script(data):
    payload = data or {}
    device_id = payload.get("device_id")
    package_name = (payload.get("package_name") or "").strip()
    process_key = f"{device_id}_{package_name}"
    proc = RUNNING_FRIDA_PROCESSES.pop(process_key, None)
    if proc:
        try:
            proc.terminate()
            emit("frida_script_status", {"status": "success", "message": f"Stopped Frida hook on {package_name}"})
        except Exception as exc:
            emit("frida_script_status", {"status": "error", "message": "Error stopping Frida: " + str(exc)})
    else:
        # Try stopping any process for this device
        stopped = False
        for k in list(RUNNING_FRIDA_PROCESSES.keys()):
            if k.startswith(device_id):
                p = RUNNING_FRIDA_PROCESSES.pop(k, None)
                if p:
                    try:
                        p.terminate()
                        stopped = True
                    except Exception:
                        pass
        if stopped:
            emit("frida_script_status", {"status": "success", "message": "Stopped Frida hook process"})
        else:
            emit("frida_script_status", {"status": "info", "message": "No running Frida session found"})


if __name__ == "__main__":
    socketio.run(app, debug=True, host="0.0.0.0", port=5000)