import subprocess
import sys


class FridaManager:
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
