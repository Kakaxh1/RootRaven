import os
import subprocess


class ADBHelper:
    def __init__(self):
        self.project_root = os.path.dirname(os.path.dirname(__file__))

    def _run(self, command, timeout=20):
        try:
            is_shell = isinstance(command, str)
            proc = subprocess.run(
                command,
                capture_output=True,
                text=True,
                shell=is_shell,
                timeout=timeout,
            )
            output = (proc.stdout or proc.stderr or "").strip()
            return proc.returncode == 0, output
        except Exception as exc:
            return False, str(exc)

    def get_target(self, device):
        ip = device["ip"]
        if "." in ip or ":" in ip:
            target = f"{ip}:5555"
            self._run(f"adb connect {target}")
            return target
        return ip

    def connect_device(self, ip):
        if "." not in ip and ":" not in ip:
            return {"status": "success", "message": f"Using USB target {ip} directly"}
        ok, out = self._run(f"adb connect {ip}:5555")
        if ok:
            return {"status": "success", "message": out or f"Connected to {ip}:5555"}
        return {"status": "error", "message": out or "ADB connect failed"}

    def start_http_server(self, device):
        ip = device["ip"]
        target = self.get_target(device)

        server_attempts = [
            ("python3", f'adb -s {target} shell "cd /sdcard && python3 -m http.server 8080"'),
            ("python", f'adb -s {target} shell "cd /sdcard && python -m SimpleHTTPServer 8080"'),
            ("toybox", f'adb -s {target} shell "toybox httpd -f -p 8080 -h /sdcard"'),
            ("busybox", f'adb -s {target} shell "busybox httpd -f -p 8080 -h /sdcard"'),
            ("busybox_local", f'adb -s {target} shell "/data/local/tmp/busybox httpd -f -p 8080 -h /sdcard"'),
        ]

        errors = []
        for method, command in server_attempts:
            ok, out = self._run(command, timeout=10)
            if ok:
                return {
                    "status": "success",
                    "method": method,
                    "message": (
                        f"HTTP server started on device port 8080 using {method}. "
                        f"Browse: http://{ip}:8080"
                    ),
                }
            errors.append(f"{method}: {out}")

        debug = self.debug_http_server_env(device)
        has_nc = any(
            item.get("check") == "which_nc" and item.get("ok")
            for item in debug.get("checks", [])
        )
        return {
            "status": "unsupported",
            "method": None,
            "message": (
                "Device does not have a supported HTTP server binary "
                "(python/python3/toybox-httpd/busybox-httpd). "
                "Use Browse Files (ADB mode)."
            ),
            "attempts": errors,
            "hints": [
                "Use Browse Files for ADB-based listing and navigation.",
                "Optionally install busybox/httpd on rooted devices.",
                f"nc availability on device: {'yes' if has_nc else 'no'} (not used as stable directory server).",
            ],
            "debug": debug,
        }

    def _get_device_abi(self, target):
        ok, out = self._run(f'adb -s {target} shell "getprop ro.product.cpu.abi"', timeout=8)
        if not ok:
            return ""
        return (out or "").strip()

    def _busybox_candidates(self, abi):
        abi_map = {
            "arm64-v8a": ["busybox-aarch64", "busybox-arm64", "busybox"],
            "armeabi-v7a": ["busybox-armv7l", "busybox-arm", "busybox"],
            "armeabi": ["busybox-armv7l", "busybox-arm", "busybox"],
            "x86_64": ["busybox-x86_64", "busybox"],
            "x86": ["busybox-i686", "busybox-x86", "busybox"],
        }
        names = abi_map.get(abi, ["busybox"])
        return [os.path.join(self.project_root, "bin", name) for name in names]

    def install_http_tools(self, device):
        target = self.get_target(device)

        abi = self._get_device_abi(target)
        candidates = self._busybox_candidates(abi)
        local_busybox = next((p for p in candidates if os.path.exists(p)), None)

        if not local_busybox:
            searched = ", ".join(candidates)
            return {
                "status": "error",
                "message": (
                    "BusyBox binary not found in project. Add one file matching your device ABI "
                    f"(detected: {abi or 'unknown'}) under /bin, e.g. busybox-aarch64 or busybox. "
                    f"Searched: {searched}"
                ),
            }

        remote_busybox = "/data/local/tmp/busybox"
        ok_push, out_push = self._run(
            f'adb -s {target} push "{local_busybox}" "{remote_busybox}"',
            timeout=20,
        )
        if not ok_push:
            return {"status": "error", "message": out_push or "Failed to push busybox to device"}

        self._run(f'adb -s {target} shell "chmod 755 {remote_busybox}"', timeout=8)
        ok_test, out_test = self._run(
            f'adb -s {target} shell "{remote_busybox} httpd --help"',
            timeout=8,
        )
        if not ok_test:
            return {
                "status": "error",
                "message": (
                    "BusyBox uploaded but httpd applet is unavailable. "
                    f"Output: {out_test}"
                ),
            }

        return {
            "status": "success",
            "message": (
                "Installed BusyBox HTTP tooling to /data/local/tmp/busybox. "
                "You can now run Start HTTP Server."
            ),
            "abi": abi,
            "binary": os.path.basename(local_busybox),
        }

    def start_frida_server(self, device):
        target = self.get_target(device)
        ok, out = self._run(f'adb -s {target} shell "ls /data/local/tmp/ | grep frida"', timeout=10)
        
        lines = [line.strip() for line in (out or "").split("\n") if line.strip()]
        if not ok or not lines:
            return {"status": "error", "message": "No frida binary found in /data/local/tmp/"}

        frida_bin = lines[0]

        start_ok, start_out = self._run(
            f'adb -s {target} shell "su -c chmod 755 /data/local/tmp/{frida_bin} && su -c /data/local/tmp/{frida_bin} &"',
            timeout=10,
        )
        
        if start_ok:
            return {"status": "success", "message": start_out or f"Started {frida_bin} successfully"}
        return {"status": "error", "message": start_out or f"Unable to start {frida_bin}"}

    def upload_file_android(self, device, local_path, remote_path):
        target = self.get_target(device)
        destination = remote_path.strip() if remote_path else "/sdcard/Download/"
        ok, out = self._run(f'adb -s {target} push "{local_path}" "{destination}"', timeout=30)
        if ok:
            return {"status": "success", "message": out or f"Uploaded to {destination}"}
        return {"status": "error", "message": out or "File upload failed"}

    def install_apk_android(self, device, local_apk_path):
        target = self.get_target(device)
        ok, out = self._run(
            f'adb -s {target} install -r "{local_apk_path}"',
            timeout=120,
        )
        if ok:
            return {"status": "success", "message": out or "APK installed successfully"}
        return {"status": "error", "message": out or "APK install failed"}

    def list_files_android(self, device, remote_path="/sdcard"):
        target = self.get_target(device)
        normalized = (remote_path or "/sdcard").strip()
        ok, out = self._run(
            f'adb -s {target} shell "ls -la {normalized}"',
            timeout=15,
        )
        if ok:
            lines = [line for line in out.splitlines() if line.strip()]
            return {
                "status": "success",
                "path": normalized,
                "entries": lines,
            }
        return {
            "status": "error",
            "path": normalized,
            "message": out or "Unable to list files via ADB",
            "entries": [],
        }

    def debug_http_server_env(self, device):
        target = self.get_target(device)
        checks = [
            ("python3", f'adb -s {target} shell "python3 --version"'),
            ("python", f'adb -s {target} shell "python --version"'),
            ("toybox_help", f'adb -s {target} shell "toybox --help"'),
            ("toybox_httpd", f'adb -s {target} shell "toybox httpd --help"'),
            ("busybox", f'adb -s {target} shell "busybox --help"'),
            ("which_httpd", f'adb -s {target} shell "which httpd"'),
            ("which_nc", f'adb -s {target} shell "which nc"'),
        ]
        results = []
        for name, command in checks:
            ok, out = self._run(command, timeout=8)
            results.append(
                {
                    "check": name,
                    "ok": ok,
                    "output": out,
                }
            )
        return {
            "status": "success",
            "checks": results,
        }

    def list_app_files_android(self, device, package):
        target = self.get_target(device)
        cmd = ["adb", "-s", target, "shell", f"su -c \"find /data/data/{package}/databases/ /data/data/{package}/shared_prefs/ -type f 2>/dev/null\""]
        ok, out = self._run(cmd, timeout=12)
        if not ok or not out.strip():
            cmd_fallback = ["adb", "-s", target, "shell", f"su -c \"ls -R /data/data/{package}/databases/ /data/data/{package}/shared_prefs/ 2>/dev/null\""]
            ok_fb, out_fb = self._run(cmd_fallback, timeout=12)
            if not ok_fb or not out_fb.strip():
                return {"status": "error", "message": "No files found or su/root check failed: " + (out or out_fb), "files": []}
            
            lines = [line.strip() for line in out_fb.splitlines() if line.strip()]
            files = []
            current_dir = ""
            for line in lines:
                if line.endswith(":"):
                    current_dir = line[:-1]
                else:
                    if line.endswith(".db") or line.endswith(".xml") or "sqlite" in line:
                        full_path = f"{current_dir}/{line}" if current_dir else line
                        full_path = full_path.replace("//", "/")
                        files.append(full_path)
            return {"status": "success", "files": files}
            
        files = [line.strip() for line in out.splitlines() if line.strip()]
        return {"status": "success", "files": files}

    def query_db_android(self, device, package, db_path, sql_query):
        import sqlite3
        import tempfile
        target = self.get_target(device)
        
        temp_dir = tempfile.gettempdir()
        temp_db_name = f"query_db_{device['id']}_{os.path.basename(db_path)}"
        local_db_path = os.path.join(temp_dir, temp_db_name)
        
        cmd_copy = ["adb", "-s", target, "shell", f"su -c \"cp \\\"{db_path}\\\" /data/local/tmp/temp_db.db && chmod 666 /data/local/tmp/temp_db.db\""]
        ok_copy, out_copy = self._run(cmd_copy, timeout=12)
        if not ok_copy:
            return {"status": "error", "message": "Failed to copy database to /data/local/tmp on device: " + out_copy}
            
        cmd_pull = ["adb", "-s", target, "pull", "/data/local/tmp/temp_db.db", local_db_path]
        ok_pull, out_pull = self._run(cmd_pull, timeout=15)
        self._run(["adb", "-s", target, "shell", "rm /data/local/tmp/temp_db.db"])
        
        if not ok_pull or not os.path.exists(local_db_path):
            return {"status": "error", "message": "Failed to pull database from device: " + out_pull}
            
        conn = None
        try:
            conn = sqlite3.connect(local_db_path)
            cursor = conn.cursor()
            cursor.execute(sql_query)
            columns = [description[0] for description in cursor.description] if cursor.description else []
            rows = cursor.fetchall()
            return {
                "status": "success",
                "columns": columns,
                "rows": rows[:1000]
            }
        except Exception as exc:
            return {"status": "error", "message": "SQLite execution error: " + str(exc)}
        finally:
            if conn:
                conn.close()
            if os.path.exists(local_db_path):
                os.remove(local_db_path)

    def read_shared_pref_android(self, device, package, pref_path):
        target = self.get_target(device)
        cmd = ["adb", "-s", target, "shell", f"su -c \"cat \\\"{pref_path}\\\"\""]
        ok, out = self._run(cmd, timeout=10)
        if ok:
            return {"status": "success", "content": out}
        return {"status": "error", "message": out or "Failed to read file"}

    def install_ca_cert_android(self, device, local_der_path):
        import tempfile
        target = self.get_target(device)
        
        temp_dir = tempfile.gettempdir()
        local_pem_path = os.path.join(temp_dir, "temp_cert.pem")
        
        ok1, out1 = self._run(f'openssl x509 -inform DER -in "{local_der_path}" -outform PEM -out "{local_pem_path}"')
        if not ok1:
            ok1, out1 = self._run(f'openssl x509 -inform PEM -in "{local_der_path}" -outform PEM -out "{local_pem_path}"')
            if not ok1:
                return {"status": "error", "message": "Failed to parse certificate using openssl. Ensure openssl is in your PATH. Output: " + out1}
        
        ok2, out2 = self._run(f'openssl x509 -inform PEM -subject_hash_old -in "{local_pem_path}" -noout')
        if not ok2 or not out2.strip():
            if os.path.exists(local_pem_path):
                os.remove(local_pem_path)
            return {"status": "error", "message": "Failed to extract subject hash: " + out2}
            
        cert_hash = out2.strip()
        cert_name = f"{cert_hash}.0"
        renamed_pem_path = os.path.join(temp_dir, cert_name)
        
        try:
            if os.path.exists(renamed_pem_path):
                os.remove(renamed_pem_path)
            os.rename(local_pem_path, renamed_pem_path)
            
            ok_push, out_push = self._run(f'adb -s {target} push "{renamed_pem_path}" /data/local/tmp/{cert_name}')
            if not ok_push:
                return {"status": "error", "message": "Failed to push certificate: " + out_push}
                
            mount_cmds = [
                "mount -o rw,remount /",
                "mount -o rw,remount /system",
                "su -c 'mount -o rw,remount /system'",
                "su -c 'mount -o rw,remount /'"
            ]
            for m_cmd in mount_cmds:
                self._run(f'adb -s {target} shell "{m_cmd}"', timeout=5)
                
            cmd_install = (
                f'adb -s {target} shell "su -c \\"'
                f'cp /data/local/tmp/{cert_name} /system/etc/security/cacerts/ && '
                f'chmod 644 /system/etc/security/cacerts/{cert_name} && '
                f'rm /data/local/tmp/{cert_name}\\""'
            )
            ok_inst, out_inst = self._run(cmd_install, timeout=12)
            if ok_inst:
                return {"status": "success", "message": f"Successfully installed CA certificate as /system/etc/security/cacerts/{cert_name}"}
                
            return {"status": "error", "message": "Failed to copy certificate to trust store: " + out_inst}
            
        finally:
            if os.path.exists(renamed_pem_path):
                os.remove(renamed_pem_path)
            if os.path.exists(local_pem_path):
                os.remove(local_pem_path)




