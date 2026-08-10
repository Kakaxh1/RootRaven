import re
import subprocess


class IntentFuzzer:
    def __init__(self):
        pass

    def _run_cmd(self, cmd, timeout=15):
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, shell=True, timeout=timeout)
            return res.returncode == 0, res.stdout or res.stderr or ""
        except Exception as exc:
            return False, str(exc)

    def extract_deeplinks(self, package_name, device):
        target_ip = device.get("ip", "") if isinstance(device, dict) else ""
        adb_prefix = f"adb -s {target_ip}" if target_ip else "adb"

        ok, output = self._run_cmd(f"{adb_prefix} shell dumpsys package {package_name}")
        if not ok or not output:
            return {"status": "error", "message": f"Unable to extract deep links for {package_name}", "deeplinks": []}

        deeplinks = []
        schemes = set(re.findall(r"scheme\s*\"([^\"]+)\"", output, re.IGNORECASE))
        hosts = set(re.findall(r"host\s*\"([^\"]+)\"", output, re.IGNORECASE))

        # Look for intent filters with scheme
        scheme_matches = re.findall(r"([a-zA-Z0-9_\-]+)://([^\s\"\'\>]+)", output)
        for s, h in scheme_matches:
            deeplinks.append(f"{s}://{h}")

        for s in schemes:
            if s not in ["http", "https", "content", "file"]:
                deeplinks.append(f"{s}://")

        unique_links = list(set(deeplinks))
        if not unique_links:
            # Add package default generic scheme
            pkg_name_short = package_name.split(".")[-1]
            unique_links = [f"{pkg_name_short}://open", f"{package_name}://main"]

        return {
            "status": "success",
            "package": package_name,
            "deeplinks": unique_links,
            "schemes": list(schemes),
        }

    def launch_intent(self, uri, action, extra_key, extra_val, package_name, device):
        target_ip = device.get("ip", "") if isinstance(device, dict) else ""
        adb_prefix = f"adb -s {target_ip}" if target_ip else "adb"

        cmd_parts = [f"{adb_prefix} shell am start -W"]

        if action:
            cmd_parts.append(f"-a {action}")
        else:
            cmd_parts.append("-a android.intent.action.VIEW")

        if uri:
            cmd_parts.append(f'-d "{uri}"')

        if extra_key and extra_val:
            cmd_parts.append(f'--es "{extra_key}" "{extra_val}"')

        if package_name:
            cmd_parts.append(f"-p {package_name}")

        full_cmd = " ".join(cmd_parts)
        ok, output = self._run_cmd(full_cmd, timeout=10)

        status_result = "SUCCESS" if ("Status: ok" in output or "Complete" in output) else "ERROR"
        if "Error:" in output or "Exception" in output:
            status_result = "CRASH_OR_ERROR"

        return {
            "status": "success" if ok else "error",
            "result_type": status_result,
            "command": full_cmd,
            "output": output.strip(),
        }
