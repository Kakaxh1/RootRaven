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
        ok, output = self._run("frida-ps -Uai")
        if not ok:
            return [{"name": "Error", "package": output or "Unable to run frida-ps"}]

        apps = []
        for line in output.splitlines():
            raw = line.strip()
            if not raw or raw.startswith("PID"):
                continue
            if set(raw) == {"-"}:
                continue
            cols = raw.split()
            if len(cols) < 3:
                continue
            package = cols[-1]
            name = " ".join(cols[1:-1]).strip()
            if package.startswith(("com.", "org.", "net.", "io.", "app.")) or "." in package:
                apps.append({"name": name or package, "package": package, "device_type": device["type"]})
        return apps

    def launch_objection(self, package_name):
        if not package_name:
            return {"status": "error", "message": "Package name is required"}

        if sys.platform.startswith("win"):
            cmd = f'start cmd /k "objection -g {package_name} explore"'
        else:
            cmd = f'python -c "import os; os.system(\'objection -g {package_name} explore\')"'
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

