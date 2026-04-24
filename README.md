# RootRaven 🐦‍⬛

RootRaven is an elite, high-performance orchestration dashboard for mobile security testing. Featuring a state-of-the-art "Hacker / Cyber" aesthetic, RootRaven provides seamless device orchestration, Frida integration, file manipulation, and secure shell (SSH) capabilities for both Android and iOS targets.

Developed by [Kakaxh1](https://github.com/Kakaxh1).

## ⚡ Features
- **Sleek Edge Dashboard**: Premium, absolute black UI powered by glassmorphism, fluid micro-animations, and dynamic UI states.
- **Fleet Management**: Centralized hub to register, categorize, and deploy against multiple Android and iOS hosts.
- **Automated Frida Orchestration**: Real-time app enumeration, SSL Pinning Bypasses, and advanced memory/application hooking natively via WebSockets.
- **Dynamic Secure Shell (SSH)**: Seamless interactive persistence to devices straight from the command center.
- **Live Server Debugging**: Streams all background tooling and application logs to an elegant floating glass console.

## 📦 Installation

Requirements: `Python 3.8+`, `ADB`, and an optional iOS tooling container.

```bash
# 1. Clone the repository
git clone https://github.com/Kakaxh1/RootRaven.git
cd RootRaven

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Launch RootRaven Service
# On Windows:
start_mobile_testing_tool.bat
# Or manually:
python app.py
```

## 🚀 Usage

Once the server begins, access the RootRaven panel:
**[http://127.0.0.1:5000](http://127.0.0.1:5000)**

Explore the **Devices Registry** to configure target IPs, navigate to the **App Intel** tab to drop payloads, or utilize the dynamic SSH module from the Dashboard!

## 📸 Screenshots

*(Replace with actual screenshots of the Dashboard, Devices, and Shell modules)*

![Dashboard Preview](https://via.placeholder.com/1200x600/000000/00f0ff?text=RootRaven+Dashboard)

## ⚖️ Disclaimer

RootRaven is developed solely for educational and authorized penetration testing on targets you expressly own or have permission to attack. The author ([Kakaxh1](https://github.com/Kakaxh1)) assumes no liability for malicious or unauthorized utilization of this software.
