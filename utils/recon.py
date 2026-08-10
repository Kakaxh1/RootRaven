import re
import subprocess


class AppRecon:
    def __init__(self):
        pass

    def _run(self, cmd, timeout=15):
        try:
            p = subprocess.run(cmd, capture_output=True, text=True, shell=True, timeout=timeout)
            return p.returncode == 0, p.stdout or p.stderr or ""
        except Exception as exc:
            return False, str(exc)

    def get_recon_intel(self, package_name, device):
        target_ip = device.get("ip", "") if isinstance(device, dict) else ""
        adb_prefix = f"adb -s {target_ip}" if target_ip else "adb"

        ok, output = self._run(f"{adb_prefix} shell dumpsys package {package_name}")
        if not ok or not output or "Unable to find package" in output:
            return {"status": "error", "message": f"Package {package_name} not found on target device"}

        # Extract Version Name & Code
        version_name_match = re.search(r"versionName=([^\s]+)", output)
        version_code_match = re.search(r"versionCode=(\d+)", output)
        version_name = version_name_match.group(1) if version_name_match else "Unknown"
        version_code = version_code_match.group(1) if version_code_match else "Unknown"

        # Extract Target & Min SDK
        target_sdk_match = re.search(r"targetSdk=(\d+)", output)
        min_sdk_match = re.search(r"minSdk=(\d+)", output)
        target_sdk = target_sdk_match.group(1) if target_sdk_match else "Unknown"
        min_sdk = min_sdk_match.group(1) if min_sdk_match else "Unknown"

        # Extract UID & Data Dir
        uid_match = re.search(r"userId=(\d+)", output)
        data_dir_match = re.search(r"dataDir=([^\s]+)", output)
        code_path_match = re.search(r"codePath=([^\s]+)", output)
        uid = uid_match.group(1) if uid_match else "Unknown"
        data_dir = data_dir_match.group(1) if data_dir_match else f"/data/data/{package_name}"
        code_path = code_path_match.group(1) if code_path_match else "Unknown"

        # Extract Security Flags
        is_debuggable = "DEBUGGABLE" in output or "FLAG_DEBUGGABLE" in output
        is_backup_allowed = "ALLOW_BACKUP" in output or "FLAG_ALLOW_BACKUP" in output
        is_cleartext_allowed = "USES_CLEARTEXT_TRAFFIC" in output or "FLAG_USES_CLEARTEXT_TRAFFIC" in output
        is_large_heap = "LARGE_HEAP" in output

        # Extract Components
        activities = list(set(re.findall(r"([a-zA-Z0-9_\.]+(?:Activity))", output)))
        services = list(set(re.findall(r"([a-zA-Z0-9_\.]+(?:Service))", output)))
        receivers = list(set(re.findall(r"([a-zA-Z0-9_\.]+(?:Receiver))", output)))
        providers = list(set(re.findall(r"([a-zA-Z0-9_\.]+(?:Provider))", output)))

        # Extract Requested Permissions
        permissions = list(set(re.findall(r"android\.permission\.[A-Z_]+", output)))

        # Extract Exported Components specifically
        exported_activities = [act for act in activities if f"{act}" in output and "exported=true" in output]

        return {
            "status": "success",
            "package": package_name,
            "version_name": version_name,
            "version_code": version_code,
            "target_sdk": target_sdk,
            "min_sdk": min_sdk,
            "uid": uid,
            "data_dir": data_dir,
            "code_path": code_path,
            "flags": {
                "debuggable": is_debuggable,
                "allow_backup": is_backup_allowed,
                "cleartext_traffic": is_cleartext_allowed,
                "large_heap": is_large_heap,
            },
            "counts": {
                "activities": len(activities),
                "services": len(services),
                "receivers": len(receivers),
                "providers": len(providers),
                "permissions": len(permissions),
            },
            "activities": activities[:30],
            "services": services[:20],
            "receivers": receivers[:20],
            "providers": providers[:20],
            "permissions": permissions,
        }
