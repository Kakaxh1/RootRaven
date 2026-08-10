# Security Policy

## Supported Versions

RootRaven follows a rolling release model on the `main` branch. Only the latest version receives security updates and patches.

| Version | Supported |
|---------|-----------|
| Latest `main` | Active |
| Any tagged release | Until superseded |
| Older / forked versions | No support |

___

## Scope and Intended Use

RootRaven is a local, self-hosted security research tool. It is designed to be run on a private machine by authorized security professionals only.

The following are **not** considered vulnerabilities in this project's threat model:

* Attacks that require physical access to the researcher's own machine
* Vulnerabilities in the target device itself (out of scope; report to device vendors)
* Issues that only affect users who run RootRaven on a public-facing network without authentication

The following **are** in scope:

* Remote Code Execution via the web interface
* Authentication bypass if auth is added in future versions
* Insecure deserialization or path traversal in API endpoints
* Credential or secret leakage in logs, responses, or storage

___

## Reporting a Vulnerability

If you discover a security vulnerability in RootRaven, **do not open a public issue**.

Report it privately via one of the following channels:

1. **GitHub Draft Security Advisory** (preferred):
   Go to [Security > Advisories > New Draft Advisory](https://github.com/Kakaxh1/RootRaven/security/advisories/new)

2. **Direct contact**:
   Open a [private discussion](https://github.com/Kakaxh1/RootRaven/discussions) or contact [@Kakaxh1](https://github.com/Kakaxh1) directly on GitHub.

___

## What to Include in Your Report

Please provide as much of the following as possible:

* **Description**: Clear explanation of the vulnerability
* **Impact**: What an attacker could achieve
* **Steps to Reproduce**: Minimal reproducible steps or proof of concept
* **Affected Version**: Git commit hash or version
* **Suggested Fix**: Optional, if you have a proposed mitigation

___

## Response Timeline

| Action | Target Time |
|--------|-------------|
| Initial acknowledgement | Within 72 hours |
| Triage and severity assessment | Within 7 days |
| Patch or mitigation | Within 30 days (critical: faster) |
| Public disclosure | After patch is released |

___

## Security Best Practices for Users

Since RootRaven runs a local web server, follow these hardening practices:

* Never expose port 5000 to the internet. Bind only to `127.0.0.1` or a private LAN interface.
* Run RootRaven in an isolated virtual machine or dedicated testing environment
* Keep `adb`, `frida`, and Python dependencies up to date
* Do not store real credentials in `data/devices.json`. Use throwaway test credentials.
* Treat the `data/` directory as sensitive. It contains device IP addresses and script payloads.

___

*Thank you for helping keep RootRaven and the security research community safe.*
