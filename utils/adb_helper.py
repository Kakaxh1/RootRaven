import os
import subprocess


class ADBHelper:
    def __init__(self):
        self.project_root = os.path.dirname(os.path.dirname(__file__))

    def _run(self, command, timeout=20):
        try:
            proc = subprocess.run(
                command,
                capture_output=True,
                text=True,
                shell=True,
                timeout=timeout,
            )
            output = (proc.stdout or proc.stderr or "").strip()
            return proc.returncode == 0, output
        except Exception as exc:
            return False, str(exc)

    def connect_device(self, ip):
        ok, out = self._run(f"adb connect {ip}:5555")
        if ok:
            return {"status": "success", "message": out or f"Connected to {ip}:5555"}
        return {"status": "error", "message": out or "ADB connect failed"}

    def start_http_server(self, device):
        ip = device["ip"]
        target = f"{ip}:5555"
        self._run(f"adb connect {target}")

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
        ip = device["ip"]
        target = f"{ip}:5555"
        self._run(f"adb connect {target}")

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
        ip = device["ip"]
        target = f"{ip}:5555"
        self._run(f"adb connect {target}")

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
        ip = device["ip"]
        target = f"{ip}:5555"
        self._run(f"adb connect {target}")
        destination = remote_path.strip() if remote_path else "/sdcard/Download/"
        ok, out = self._run(f'adb -s {target} push "{local_path}" "{destination}"', timeout=30)
        if ok:
            return {"status": "success", "message": out or f"Uploaded to {destination}"}
        return {"status": "error", "message": out or "File upload failed"}

    def install_apk_android(self, device, local_apk_path):
        ip = device["ip"]
        target = f"{ip}:5555"
        self._run(f"adb connect {target}")
        ok, out = self._run(
            f'adb -s {target} install -r "{local_apk_path}"',
            timeout=120,
        )
        if ok:
            return {"status": "success", "message": out or "APK installed successfully"}
        return {"status": "error", "message": out or "APK install failed"}

    def list_files_android(self, device, remote_path="/sdcard"):
        ip = device["ip"]
        target = f"{ip}:5555"
        self._run(f"adb connect {target}")
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
        ip = device["ip"]
        target = f"{ip}:5555"
        self._run(f"adb connect {target}")
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

