# RootRaven — Mobile Penetration Testing Command Center

> Self-hosted Android and iOS security testing dashboard. ADB shell, Frida hooking, SSL pinning bypass, APK decompilation, SSH shell, Burp proxy setup, and live logcat streaming in one web interface.

<div align="center">

![Python](https://img.shields.io/badge/Python-3.8%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-2.3-000000?style=for-the-badge&logo=flask&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20iOS-brightgreen?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-cyan?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Active-success?style=for-the-badge)

</div>

___

## Overview

**RootRaven** is a self-hosted web command center for Android and iOS penetration testing. It provides a unified interface for ADB device orchestration, interactive ADB shell sessions, SSH shell access, Frida dynamic instrumentation, SSL pinning bypass, APK decompilation with JADX, SQLite database inspection, SharedPreference extraction, Burp Suite CA certificate installation, and live device logcat streaming.

Built for mobile security researchers, Android pentesters, and red teamers who need a fast, clean, and scriptable tooling surface running entirely on their own machine.



___

## Features

| Module | Description |
|---|---|
| Fleet Management & Device Health | Register, classify, and monitor multiple Android & iOS targets with deep telemetry (OS, API, ABI, Root status, SELinux, Battery) |
| App Intelligence & 1-Click Recon | Comprehensive app metadata, SDK levels, security flags (debuggable, allowBackup, cleartext), and component counts |
| Manifest & Vulnerability Scanner | Automated audit for debug flags, cleartext traffic, backup settings, exported components, and high-privilege permissions |
| SharedPreferences Secret Finder | Automated high-entropy scanner discovering tokens, API keys, AWS credentials, and PII in XML storage |
| Frida Dynamic Hooking & Snippet Hub | 1-Click pre-built hook templates (Universal SSL, Root Bypass, Crypto Sniffer, Biometrics, Anti-Debug) with interactive injection modal |
| Deep Link & Intent Fuzzer | Discovers registered custom URI schemes with security fuzzing payloads (Path Traversal, Open Redirect, XSS, SQLi) |
| OWASP MASVS Checklist | Interactive MASVS v2 compliance tracker with persistent status/notes and one-click HTML audit report export |
| Evidence Vault | Centralized repository for credentials, captured tokens, logs, command snippets, and database dumps with markdown export |
| Burp Suite Setup Wizard | Automated WiFi proxy configuration, CA certificate installer into system trust store, and connectivity ping test |
| Smart Logcat Streamer | Real-time device logcat streaming with smart regex highlighting for Errors, Secrets, URLs, and PII |
| Storage Explorer | In-browser SQLite database and SharedPreferences XML file inspector |
| Automated APK Decompiler | Upload `.apk` files for background decompilation via `jadx` with interactive Java source code viewer |

___

## Architecture

```
Browser (RootRaven Command Center)
     |  WebSocket (Socket.IO)
     |  REST API (Flask)
     v
 app.py (Flask + SocketIO Server)
     |
     +-- utils/device_manager.py   # Target fleet registry & deep health telemetry
     +-- utils/recon.py            # One-click app intelligence engine
     +-- utils/scanner.py          # Static manifest & SharedPreferences secret scanner
     +-- utils/fuzzer.py           # Deep link extractor & intent fuzzer
     +-- utils/frida_manager.py    # Frida script persistence, objection & hook runner
     +-- utils/vault_manager.py    # Evidence vault storage & markdown exporter
     +-- utils/masvs_manager.py    # OWASP MASVS assessment store & HTML report exporter
     +-- utils/adb_helper.py       # ADB command orchestration & logcat streamer
     |
     +-- templates/index.html      # Dashboard (command center & Burp wizard)
     +-- templates/devices.html    # Device fleet registry & health modal
     +-- templates/apps.html       # App Recon, Frida Hub, Manifest Scanner, Fuzzer, Storage
     +-- templates/vault.html      # Evidence Vault UI
     +-- templates/masvs.html      # OWASP MASVS Compliance Checklist UI
     |
     `-- data/scripts/             # Pre-built Frida instrumentation snippets
```         +-- devices.json          # Persisted device registry
         `-- scripts/              # Saved Frida hook scripts
```

___

## Requirements

### System Tools (must be in PATH)

| Tool | Purpose | Install |
|---|---|---|
| `adb` | Android device communication | [Android SDK Platform Tools](https://developer.android.com/tools/releases/platform-tools) |
| `frida-tools` | Dynamic instrumentation | `pip install frida-tools` |
| `jadx` | APK decompilation | [GitHub Releases](https://github.com/skylot/jadx/releases) |
| `openssl` | CA certificate conversion | Bundled on Linux/macOS, [Win32 builds](https://slproweb.com/products/Win32OpenSSL.html) on Windows |

### Python Dependencies

```
Flask==2.3.2
Flask-SocketIO==5.3.4
paramiko==3.1.0
python-socketio==5.9.0
eventlet==0.33.3
requests==2.32.3
```

___

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/Kakaxh1/RootRaven.git
cd RootRaven

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Launch RootRaven
# Windows (recommended):
start_mobile_testing_tool.bat

# Manual:
python app.py
```

The dashboard will be available at **http://127.0.0.1:5000**

___

## Setup Guide

### Android Targets

1. Enable **USB Debugging** (Settings > Developer Options > USB Debugging)
2. Connect the device via USB and accept the **Allow USB Debugging** prompt on the phone screen
3. Verify connection: `adb devices` should show `device` status (not `unauthorized` or `offline`)
4. In RootRaven, go to **Devices** and add the device with its IP and name

### iOS Targets

1. Ensure a jailbreak is active (Checkra1n, Palera1n, etc.)
2. Install **OpenSSH** from your jailbreak package manager
3. Add the device in RootRaven **Devices** with the iOS IP and SSH credentials

### SSH Shell via Termux (Android)

1. Install **Termux** from F-Droid (not the Play Store build)
2. Inside Termux: `pkg install openssh && sshd && passwd`
3. RootRaven automatically port-forwards the SSH port via ADB on connect, bypassing router AP isolation with no direct Wi-Fi access required

### Frida Setup

1. Push and run `frida-server` on the Android device matching your device ABI
2. Alternatively, use the **Start Frida Server** button on the Devices page (requires root)

___

## Project Structure

```
RootRaven/
+-- app.py                        # Main Flask application
+-- requirements.txt
+-- start_mobile_testing_tool.bat # Windows launcher
|
+-- templates/
|   +-- index.html                # Dashboard (command center)
|   +-- devices.html              # Device registration
|   `-- apps.html                 # App Intel and tooling
|
+-- static/
|   +-- style.css                 # Premium dark theme
|   `-- app.js                    # Client-side orchestration logic
|
+-- utils/
|   +-- adb_helper.py             # ADB subprocess wrappers
|   +-- frida_manager.py          # Frida script manager
|   `-- device_manager.py         # Device registry
|
`-- data/
    +-- devices.json              # Persisted device store
    `-- scripts/                  # Saved Frida hook templates
        +-- android_root_bypass.js
        +-- ios_jb_bypass.js
        `-- memory_scanner.js
```

___

## Legal Disclaimer

RootRaven is developed exclusively for authorized security research and penetration testing.

You must have **explicit written permission** from the device and application owners before using this tool against any target. Unauthorized access to computer systems is illegal in most jurisdictions.

The author ([Kakaxh1](https://github.com/Kakaxh1)) accepts no liability for any misuse, damage, or legal consequences arising from unauthorized use of this software.

Use responsibly. Test only what you own or have permission to test.

___

## Author

**Kakaxh1** — [github.com/Kakaxh1](https://github.com/Kakaxh1)

___

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

___

## Keywords

android penetration testing, ios penetration testing, mobile security testing, frida android, frida ios, adb shell, ssl pinning bypass, burp suite android, mobile pentest tool, android hacking tool, frida hooking, apk decompiler, jadx, android forensics, mobile application security, dynamic analysis android, frida instrumentation, android red team, python security tool, android debugging, mobile security research, objection frida, android ssl bypass, frida server, android security assessment