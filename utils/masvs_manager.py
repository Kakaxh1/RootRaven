import datetime
import json
import os


class MasvsManager:
    DEFAULT_CHECKLIST = [
        # MASVS-STORAGE
        {"id": "MASVS-STORAGE-1", "category": "Storage", "title": "System Credential Storage", "description": "Sensitive data is stored securely using Keystore / EncryptedSharedPreferences.", "status": "NOT_TESTED", "notes": ""},
        {"id": "MASVS-STORAGE-2", "category": "Storage", "title": "No Sensitive Data in Logs", "description": "No sensitive tokens, credentials, or PII are logged to Logcat.", "status": "NOT_TESTED", "notes": ""},
        {"id": "MASVS-STORAGE-3", "category": "Storage", "title": "External Storage Isolation", "description": "No sensitive data is written to world-readable external shared storage.", "status": "NOT_TESTED", "notes": ""},
        {"id": "MASVS-STORAGE-4", "category": "Storage", "title": "Backup & Cache Security", "description": "android:allowBackup is disabled or explicitly excludes private databases.", "status": "NOT_TESTED", "notes": ""},

        # MASVS-CRYPTO
        {"id": "MASVS-CRYPTO-1", "category": "Cryptography", "title": "Industry-Standard Ciphers", "description": "App uses modern cryptographic algorithms (AES-GCM, RSA-2048+) without deprecated algorithms (DES, MD5).", "status": "NOT_TESTED", "notes": ""},
        {"id": "MASVS-CRYPTO-2", "category": "Cryptography", "title": "Key Generation & Derivation", "description": "Cryptographic keys are not hardcoded in APK assets or native binaries.", "status": "NOT_TESTED", "notes": ""},
        {"id": "MASVS-CRYPTO-3", "category": "Cryptography", "title": "Secure Random Numbers", "description": "App uses SecureRandom instead of predictable random generators.", "status": "NOT_TESTED", "notes": ""},

        # MASVS-AUTH
        {"id": "MASVS-AUTH-1", "category": "Authentication", "title": "Local Biometric & PIN Auth", "description": "Local biometric authentication utilizes CryptoObject Keystore integration.", "status": "NOT_TESTED", "notes": ""},
        {"id": "MASVS-AUTH-2", "category": "Authentication", "title": "Session Management & Invalidation", "description": "Server-side tokens and sessions expire upon logout.", "status": "NOT_TESTED", "notes": ""},

        # MASVS-NETWORK
        {"id": "MASVS-NETWORK-1", "category": "Network", "title": "TLS Encryption Enforced", "description": "All network traffic is strictly transmitted over TLS 1.2+ with no cleartext allowed.", "status": "NOT_TESTED", "notes": ""},
        {"id": "MASVS-NETWORK-2", "category": "Network", "title": "SSL Certificate Pinning", "description": "App implements SSL pinning (CertificatePinner, NetworkSecurityConfig) to resist MitM proxies.", "status": "NOT_TESTED", "notes": ""},

        # MASVS-PLATFORM
        {"id": "MASVS-PLATFORM-1", "category": "Platform Interaction", "title": "IPC Component Export Controls", "description": "Activities, Services, Receivers, and Providers are not exported unless necessary.", "status": "NOT_TESTED", "notes": ""},
        {"id": "MASVS-PLATFORM-2", "category": "Platform Interaction", "title": "Deep Link & Intent Validation", "description": "Incoming URI schemes and intent parameters are strictly validated against injection.", "status": "NOT_TESTED", "notes": ""},
        {"id": "MASVS-PLATFORM-3", "category": "Platform Interaction", "title": "WebView Security", "description": "WebViews disable setAllowFileAccessFromFileURLs and JavaScriptInterface.", "status": "NOT_TESTED", "notes": ""},

        # MASVS-CODE & RESILIENCE
        {"id": "MASVS-RESILIENCE-1", "category": "Resilience", "title": "Root & Jailbreak Detection", "description": "App detects rooted Android devices or jailbroken iOS environments.", "status": "NOT_TESTED", "notes": ""},
        {"id": "MASVS-RESILIENCE-2", "category": "Resilience", "title": "Anti-Debugging & Hooking Evasion", "description": "App employs ptrace/Frida runtime evasion techniques.", "status": "NOT_TESTED", "notes": ""},
    ]

    def __init__(self):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        self.data_dir = os.path.join(base_dir, "data")
        self.masvs_file = os.path.join(self.data_dir, "masvs_assessments.json")
        os.makedirs(self.data_dir, exist_ok=True)
        if not os.path.exists(self.masvs_file):
            self._save({})

    def _load(self):
        try:
            with open(self.masvs_file, "r", encoding="utf-8") as fp:
                return json.load(fp)
        except Exception:
            return {}

    def _save(self, data):
        with open(self.masvs_file, "w", encoding="utf-8") as fp:
            json.dump(data, fp, indent=2)

    def get_assessment(self, package_name):
        data = self._load()
        if package_name in data:
            return data[package_name]
        # Return default checklist template for new package
        return {
            "package": package_name,
            "checklist": list(self.DEFAULT_CHECKLIST),
            "updated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }

    def save_assessment(self, package_name, checklist):
        data = self._load()
        assessment = {
            "package": package_name,
            "checklist": checklist,
            "updated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
        data[package_name] = assessment
        self._save(data)
        return {"status": "success", "assessment": assessment}

    def export_report_html(self, package_name):
        assessment = self.get_assessment(package_name)
        checklist = assessment.get("checklist", [])

        passed = sum(1 for c in checklist if c.get("status") == "PASS")
        failed = sum(1 for c in checklist if c.get("status") == "FAIL")
        not_tested = sum(1 for c in checklist if c.get("status") == "NOT_TESTED")
        total = len(checklist)

        score_pct = int((passed / total) * 100) if total > 0 else 0

        html = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>MASVS Security Assessment — {package_name}</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 40px; }}
    .container {{ max-width: 900px; margin: 0 auto; background: #1e293b; padding: 32px; border-radius: 12px; border: 1px solid #334155; }}
    h1 {{ margin-top: 0; color: #38bdf8; font-size: 24px; }}
    .meta {{ font-size: 13px; color: #94a3b8; margin-bottom: 24px; }}
    .score-card {{ display: flex; gap: 16px; margin-bottom: 30px; }}
    .score-box {{ flex: 1; padding: 16px; border-radius: 8px; text-align: center; background: #0f172a; border: 1px solid #334155; }}
    .score-num {{ font-size: 28px; font-weight: 800; font-family: monospace; }}
    .score-pass {{ color: #4ade80; }}
    .score-fail {{ color: #f87171; }}
    .score-nt {{ color: #94a3b8; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 20px; }}
    th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #334155; font-size: 13px; }}
    th {{ background: #0f172a; color: #38bdf8; font-weight: 600; text-transform: uppercase; font-size: 11px; }}
    .badge {{ font-weight: 700; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-family: monospace; }}
    .badge-PASS {{ background: rgba(74, 222, 128, 0.2); color: #4ade80; }}
    .badge-FAIL {{ background: rgba(248, 113, 113, 0.2); color: #f87171; }}
    .badge-NOT_TESTED {{ background: rgba(148, 163, 184, 0.2); color: #94a3b8; }}
  </style>
</head>
<body>
  <div class="container">
    <h1>OWASP MASVS Mobile Security Assessment</h1>
    <div class="meta">Target Package: <b>{package_name}</b> | Generated by RootRaven: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</div>
    
    <div class="score-card">
      <div class="score-box"><div class="score-num score-pass">{passed}</div><div>Passed Controls</div></div>
      <div class="score-box"><div class="score-num score-fail">{failed}</div><div>Failed / Vulnerable</div></div>
      <div class="score-box"><div class="score-num score-nt">{not_tested}</div><div>Not Tested</div></div>
      <div class="score-box"><div class="score-num" style="color:#38bdf8;">{score_pct}%</div><div>Compliance Score</div></div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Control ID</th>
          <th>Category</th>
          <th>Verification Requirement</th>
          <th>Status</th>
          <th>Auditor Notes</th>
        </tr>
      </thead>
      <tbody>
"""
        for item in checklist:
            st = item.get("status", "NOT_TESTED")
            html += f"""
        <tr>
          <td style="font-family:monospace; color:#38bdf8;"><b>{item.get('id')}</b></td>
          <td>{item.get('category')}</td>
          <td><b>{item.get('title')}</b><br><span style="color:#94a3b8; font-size:12px;">{item.get('description')}</span></td>
          <td><span class="badge badge-{st}">{st}</span></td>
          <td style="color:#cbd5e1;">{item.get('notes') or '-'}</td>
        </tr>
"""
        html += """
      </tbody>
    </table>
  </div>
</body>
</html>
"""
        return html
