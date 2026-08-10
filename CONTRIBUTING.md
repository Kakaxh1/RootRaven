# Contributing to RootRaven

Thank you for taking the time to contribute. Every bug report, feature idea, and pull request makes RootRaven better.

___

## Table of Contents

* [Code of Conduct](#code-of-conduct)
* [How to Report a Bug](#how-to-report-a-bug)
* [How to Request a Feature](#how-to-request-a-feature)
* [Development Setup](#development-setup)
* [Pull Request Process](#pull-request-process)
* [Coding Style](#coding-style)

___

## Code of Conduct

This project is a security research tool. All contributors are expected to:

* Be respectful and constructive in all discussions
* Never contribute code designed to attack systems without authorization
* Follow responsible disclosure for any security vulnerabilities found

___

## How to Report a Bug

Before opening a bug report, check that it has not already been reported in [Issues](https://github.com/Kakaxh1/RootRaven/issues).

When reporting, include:

* **Environment**: OS, Python version, ADB version
* **Steps to reproduce**: Clear, minimal reproduction steps
* **Expected behavior**: What you expected to happen
* **Actual behavior**: What actually happened, with error output or a screenshot
* **Device info**: Type (Android/iOS), OS version if relevant

> Security vulnerabilities must NOT be filed as public issues. See [SECURITY.md](SECURITY.md) for the private disclosure process.

___

## How to Request a Feature

Open a [Feature Request](https://github.com/Kakaxh1/RootRaven/issues/new?template=feature_request.md) and include:

* What problem it solves or what workflow it improves
* How you envision it working (UI, API, etc.)
* Any relevant reference tools or prior art

___

## Development Setup

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/RootRaven.git
cd RootRaven

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run the server
python app.py
# Dashboard at http://127.0.0.1:5000
```

### System Requirements

* Python 3.8+
* `adb` in PATH
* `frida-tools` via `pip install frida-tools` for Frida features
* `jadx` in PATH for APK decompiler features

___

## Pull Request Process

1. **Branch naming**: Use a descriptive name:
   * `feature/logcat-filter-regex`
   * `fix/adb-shell-target-usb`
   * `docs/update-readme`

2. **Keep PRs focused**: One feature or fix per PR. Avoid bundling unrelated changes.

3. **Test your changes**:
   * Verify the Flask server starts without errors
   * Test with an actual connected Android device where applicable
   * Check that the browser console shows no JS errors

4. **Update documentation** if your change adds or removes a visible feature.

5. **PR description** must include:
   * What changed and why
   * How to test the change
   * Any known limitations or follow-up tasks

___

## Coding Style

### Python (`app.py`, `utils/`)

* Follow **PEP 8**: 4-space indentation, snake_case, clear docstrings
* Keep route handlers thin. Move logic into `utils/` helpers.
* All subprocess calls should use list-based arguments, not raw shell strings, to prevent quoting issues on Windows
* Always return structured JSON: `{"status": "success" or "error", "message": "..."}`

### JavaScript (`static/app.js`)

* Use native vanilla JS with no frameworks
* Event bindings belong in the appropriate `render*()` function
* Socket.IO events should have clear `on` and `emit` naming matching backend handlers
* All UI writes should go through helper functions (`toast()`, `debugLog()`, `writeSsh()`, etc.)

### CSS (`static/style.css`)

* Maintain the absolute black and cyan glassmorphism aesthetic
* Use CSS variables defined in `:root`. Do not hardcode color values.
* Micro-animations and hover effects are encouraged for interactive elements

___

*Thanks again for contributing. Every improvement matters.*
