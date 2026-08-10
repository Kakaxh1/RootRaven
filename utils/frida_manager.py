import os
import subprocess
import sys


class FridaManager:
    def __init__(self):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        self.scripts_dir = os.path.join(base_dir, "data", "scripts")
        os.makedirs(self.scripts_dir, exist_ok=True)

    def _run(self, command, timeout=25):
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

    def get_app_list(self, device):
        device_type = device.get("type", "android") if isinstance(device, dict) else "android"
        target_ip = device.get("ip", "") if isinstance(device, dict) else ""
        is_usb = not target_ip or ("." not in target_ip and ":" not in target_ip)

        # 1. Determine frida-ps targeting arguments
        if is_usb and target_ip:
            frida_cmd = f"frida-ps -D {target_ip} -ai"
        elif not is_usb and target_ip:
            host_port = target_ip if ":" in target_ip else f"{target_ip}:27042"
            frida_cmd = f"frida-ps -H {host_port} -ai"
        else:
            frida_cmd = "frida-ps -Uai"

        ok, output = self._run(frida_cmd, timeout=12)

        apps = []
        if ok and output:
            for line in output.splitlines():
                raw = line.strip()
                if not raw or raw.startswith("PID") or set(raw) == {"-"}:
                    continue
                cols = raw.split()
                if len(cols) < 2:
                    continue
                package = cols[-1]
                name = " ".join(cols[1:-1]).strip() if len(cols) > 2 else package
                if package.startswith(("com.", "org.", "net.", "io.", "app.", "in.", "my.")) or "." in package:
                    apps.append({"name": name or package, "package": package, "device_type": device_type})

        # 2. If frida-ps returned no apps and device is Android, fallback to ADB package list
        if not apps and device_type == "android" and target_ip:
            adb_target = f"-s {target_ip}"
            adb_ok, adb_out = self._run(f"adb {adb_target} shell pm list packages -3", timeout=8)
            if adb_ok and adb_out:
                for line in adb_out.splitlines():
                    line = line.strip()
                    if line.startswith("package:"):
                        pkg = line.replace("package:", "").strip()
                        apps.append({"name": pkg.split(".")[-1].capitalize(), "package": pkg, "device_type": "android"})

        if not apps:
            err_msg = output if not ok else "No third-party packages found on selected device"
            return [{"name": "Error", "package": err_msg or "Unable to retrieve package list"}]

        return apps

    def launch_objection(self, package_name, device=None):
        if not package_name:
            return {"status": "error", "message": "Package name is required"}

        target_ip = device.get("ip", "") if isinstance(device, dict) else ""
        device_type = device.get("type", "android") if isinstance(device, dict) else "android"
        is_usb = not target_ip or ("." not in target_ip and ":" not in target_ip)

        # Build specific objection command arguments
        if is_usb and target_ip:
            # USB device with specific serial ID (-S)
            objection_args = f"-S {target_ip} -g {package_name} explore"
        elif not is_usb and target_ip:
            # Network host and port (-N -h ... -p ...)
            host_only = target_ip.split(":")[0]
            port_only = target_ip.split(":")[1] if ":" in target_ip else "27042"
            objection_args = f"-N -h {host_only} -p {port_only} -g {package_name} explore"
        else:
            objection_args = f"-g {package_name} explore"

        title = f"RootRaven - Objection ({package_name})"
        if sys.platform.startswith("win"):
            # Launch via PowerShell Start-Process to guarantee visible new console window on Windows
            ps_cmd = f'Start-Process cmd.exe -ArgumentList \'/k title RootRaven - Objection ({package_name}) && objection {objection_args}\''
            try:
                subprocess.Popen(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps_cmd])
                return {"status": "success", "message": f"Opened Objection terminal for {package_name}"}
            except Exception:
                try:
                    os.system(f'start "RootRaven - Objection" cmd.exe /k "objection {objection_args}"')
                    return {"status": "success", "message": f"Opened Objection terminal for {package_name}"}
                except Exception as exc:
                    return {"status": "error", "message": f"Failed to launch terminal: {str(exc)}"}
        else:
            cmd = f'python -c "import os; os.system(\'objection {objection_args}\')"'
            ok, output = self._run(cmd, timeout=5)
            if ok:
                return {"status": "success", "message": f"Objection launched for {package_name}"}
            return {"status": "error", "message": output or "Failed to launch Objection"}

    def bypass_ssl_pinning(self, device_type):
        value = "android sslpinning disable" if device_type == "android" else "ios sslpinning disable"
        return {"status": "success", "command": value}

    def get_scripts(self):
        try:
            files = os.listdir(self.scripts_dir)
            scripts = []
            for file in files:
                if file.endswith(".js"):
                    filepath = os.path.join(self.scripts_dir, file)
                    with open(filepath, "r", encoding="utf-8") as fp:
                        content = fp.read()
                    scripts.append({"name": file, "content": content})
            return {"status": "success", "scripts": scripts}
        except Exception as exc:
            return {"status": "error", "message": str(exc), "scripts": []}

    def save_script(self, name, content):
        if not name.endswith(".js"):
            name = name + ".js"
        # Sanitize filename
        name = os.path.basename(name)
        try:
            filepath = os.path.join(self.scripts_dir, name)
            with open(filepath, "w", encoding="utf-8") as fp:
                fp.write(content)
            return {"status": "success", "message": f"Script {name} saved successfully"}
        except Exception as exc:
            return {"status": "error", "message": str(exc)}

    def delete_script(self, name):
        name = os.path.basename(name)
        try:
            filepath = os.path.join(self.scripts_dir, name)
            if os.path.exists(filepath):
                os.remove(filepath)
                return {"status": "success", "message": f"Script {name} deleted"}
            return {"status": "error", "message": "Script not found"}
        except Exception as exc:
            return {"status": "error", "message": str(exc)}

