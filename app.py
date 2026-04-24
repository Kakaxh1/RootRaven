import os
import socket
import tempfile
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
socketio = SocketIO(app, cors_allowed_origins="*")

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

UPLOAD_FOLDER = os.path.join(tempfile.gettempdir(), "mobile_uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

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
    emit("objection_status", frida_manager.launch_objection(payload.get("app_name", "")))


@socketio.on("bypass_ssl")
def handle_ssl_bypass(data):
    payload = data or {}
    emit(
        "ssl_bypass_status",
        frida_manager.bypass_ssl_pinning(payload.get("device_type", "android")),
    )


if __name__ == "__main__":
    socketio.run(app, debug=True, host="0.0.0.0", port=5000)