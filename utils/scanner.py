import re
import subprocess


class StaticScanner:
    def __init__(self):
        pass

    def _run_cmd(self, cmd, timeout=15):
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, shell=True, timeout=timeout)
            return res.returncode == 0, res.stdout or res.stderr or ""
        except Exception as exc:
            return False, str(exc)

    def scan_android_package(self, package_name, device):
        target_ip = device.get("ip", "") if isinstance(device, dict) else ""
        adb_prefix = f"adb -s {target_ip}" if target_ip else "adb"

        ok, output = self._run_cmd(f"{adb_prefix} shell dumpsys package {package_name}")
        if not ok or not output or "Unable to find package" in output:
            return {
                "status": "error",
                "message": f"Package {package_name} not found on target device",
                "vulnerabilities": [],
                "summary": {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0},
            }

        vulnerabilities = []

        # 1. Check Debuggable flag
        if "DEBUGGABLE" in output or "flags=[ DEBUGGABLE" in output or "FLAG_DEBUGGABLE" in output:
            vulnerabilities.append({
                "id": "VULN-001",
                "title": "Application Is Debuggable",
                "severity": "CRITICAL",
                "category": "Manifest Configuration",
                "description": "android:debuggable is set to true. Attackers can attach jdb or Frida to inspect heap memory and execute arbitrary code.",
                "remediation": "Set android:debuggable=\"false\" in AndroidManifest.xml for production builds.",
            })

        # 2. Check AllowBackup flag
        if "ALLOW_BACKUP" in output or "flags=[ ALLOW_BACKUP" in output:
            vulnerabilities.append({
                "id": "VULN-002",
                "title": "Application Data Backup Enabled",
                "severity": "MEDIUM",
                "category": "Data Storage",
                "description": "android:allowBackup is enabled. Internal app data and databases can be extracted via ADB backup without root.",
                "remediation": "Set android:allowBackup=\"false\" unless cloud backup is explicitly required.",
            })

        # 3. Check Cleartext Traffic
        if "USES_CLEARTEXT_TRAFFIC" in output:
            vulnerabilities.append({
                "id": "VULN-003",
                "title": "Cleartext HTTP Traffic Allowed",
                "severity": "HIGH",
                "category": "Network Security",
                "description": "android:usesCleartextTraffic is enabled. Network traffic may be transmitted over unencrypted HTTP exposing sensitive tokens.",
                "remediation": "Configure NetworkSecurityConfig to enforce TLS/HTTPS strictly for all domains.",
            })

        # 4. Check Exported Activities
        exported_activities = []
        activity_section = re.findall(r"Activity\s+([^\s:]+).*?exported=(true|false)", output, re.DOTALL | re.IGNORECASE)
        for act, exp in activity_section:
            if exp.lower() == "true":
                exported_activities.append(act)

        # Also search for exported components directly
        exported_matches = re.findall(r"([a-zA-Z0-9_\.]+(?:Activity|Service|Receiver|Provider))[\s\S]*?exported=true", output)
        exported_unique = list(set(exported_matches + exported_activities))

        if exported_unique:
            vulnerabilities.append({
                "id": "VULN-004",
                "title": f"Exported Components ({len(exported_unique)} Detected)",
                "severity": "HIGH",
                "category": "IPC & Component Security",
                "description": f"The application exports components accessible by third-party apps: {', '.join(exported_unique[:4])}{'...' if len(exported_unique) > 4 else ''}",
                "remediation": "Set android:exported=\"false\" on internal components or enforce custom signature permissions.",
                "components": exported_unique,
            })

        # 5. Check Dangerous Permissions
        dangerous_perms = [
            "android.permission.READ_EXTERNAL_STORAGE",
            "android.permission.WRITE_EXTERNAL_STORAGE",
            "android.permission.RECORD_AUDIO",
            "android.permission.CAMERA",
            "android.permission.ACCESS_FINE_LOCATION",
            "android.permission.READ_SMS",
            "android.permission.RECEIVE_SMS",
            "android.permission.READ_CONTACTS",
            "android.permission.SYSTEM_ALERT_WINDOW",
        ]
        found_perms = []
        for perm in dangerous_perms:
            if perm in output:
                found_perms.append(perm.split(".")[-1])

        if found_perms:
            vulnerabilities.append({
                "id": "VULN-005",
                "title": f"High Privilege Permissions ({len(found_perms)} Requested)",
                "severity": "LOW",
                "category": "Permissions",
                "description": f"The application requests sensitive device permissions: {', '.join(found_perms)}",
                "remediation": "Follow the principle of least privilege and remove unused dangerous permissions.",
                "permissions": found_perms,
            })

        # Calculate severity summary
        summary = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
        for v in vulnerabilities:
            sev = v["severity"].lower()
            summary[sev] = summary.get(sev, 0) + 1

        return {
            "status": "success",
            "package": package_name,
            "vulnerabilities": vulnerabilities,
            "summary": summary,
        }

    def scan_shared_preferences(self, package_name, device):
        target_ip = device.get("ip", "") if isinstance(device, dict) else ""
        adb_prefix = f"adb -s {target_ip}" if target_ip else "adb"

        # List shared_prefs files
        ok, files_out = self._run_cmd(f"{adb_prefix} shell su -c 'ls -1 /data/data/{package_name}/shared_prefs/'")
        if not ok or not files_out or "No such file" in files_out:
            # Try without su
            ok, files_out = self._run_cmd(f"{adb_prefix} shell ls -1 /data/data/{package_name}/shared_prefs/")

        if not ok or not files_out or "No such file" in files_out:
            return {
                "status": "info",
                "message": "No SharedPreferences directory found or permissions denied (requires root/debuggable)",
                "findings": [],
            }

        files = [f.strip() for f in files_out.splitlines() if f.strip().endswith(".xml")]
        findings = []

        secret_patterns = [
            ("JWT / Bearer Token", r"eyJ[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]{10,}", "HIGH"),
            ("API Key / Secret", r"(?i)(?:api_?key|secret|token|password|auth_?token|client_?secret)[\"'\s:=]+([^\"'<>\s]{6,})", "HIGH"),
            ("Password / Credential", r"(?i)<string\s+name=[\"'](?:pass|password|user_pass|pwd|auth)[\"']>([^<]+)</string>", "HIGH"),
            ("AWS Access Key", r"AKIA[0-9A-Z]{16}", "CRITICAL"),
            ("Firebase / Google API Key", r"AIza[0-9A-Za-z\-_]{35}", "MEDIUM"),
            ("Email Address (PII)", r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", "LOW"),
            ("Session Identifier", r"(?i)(?:session_?id|sid|user_?id)[\"'\s:=]+([^\"'<>\s]{6,})", "MEDIUM"),
        ]

        for xml_file in files:
            cat_cmd = f"{adb_prefix} shell su -c 'cat /data/data/{package_name}/shared_prefs/{xml_file}'"
            cat_ok, content = self._run_cmd(cat_cmd)
            if not cat_ok or not content:
                cat_ok, content = self._run_cmd(f"{adb_prefix} shell cat /data/data/{package_name}/shared_prefs/{xml_file}")

            if not cat_ok or not content:
                continue

            for title, pattern, severity in secret_patterns:
                matches = re.findall(pattern, content)
                for m in matches:
                    val = m if isinstance(m, str) else m[0]
                    # Mask sensitive value for safe preview
                    masked_val = val[:4] + "*" * min(len(val) - 8, 12) + val[-4:] if len(val) > 8 else "****"
                    findings.append({
                        "file": xml_file,
                        "type": title,
                        "severity": severity,
                        "masked_value": masked_val,
                        "raw_value": val,
                    })

        return {
            "status": "success",
            "package": package_name,
            "scanned_files_count": len(files),
            "files": files,
            "findings": findings,
        }
