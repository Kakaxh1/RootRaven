import json
import os
import uuid


class DeviceManager:
    def __init__(self):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        self.data_dir = os.path.join(base_dir, "data")
        self.data_file = os.path.join(self.data_dir, "devices.json")
        os.makedirs(self.data_dir, exist_ok=True)
        if not os.path.exists(self.data_file):
            self._save([])

    def _load(self):
        try:
            with open(self.data_file, "r", encoding="utf-8") as fp:
                return json.load(fp)
        except Exception:
            return []

    def _save(self, devices):
        with open(self.data_file, "w", encoding="utf-8") as fp:
            json.dump(devices, fp, indent=2)

    def get_all_devices(self):
        return self._load()

    def get_device(self, device_id):
        devices = self._load()
        return next((d for d in devices if d["id"] == device_id), None)

    def add_device(self, data):
        name = (data.get("name") or "").strip()
        ip = (data.get("ip") or "").strip()
        device_type = (data.get("type") or "").strip().lower()

        if not name or not ip or device_type not in ("android", "ios"):
            return {"status": "error", "message": "Invalid device payload"}

        device = {
            "id": str(uuid.uuid4()),
            "name": name,
            "ip": ip,
            "type": device_type,
            "description": (data.get("description") or "").strip(),
            "ssh_id": (data.get("ssh_id") or "").strip(),
            "ssh_pass": (data.get("ssh_pass") or "").strip(),
        }
        devices = self._load()
        devices.append(device)
        self._save(devices)
        return {"status": "success", "device": device}

    def update_device(self, device_id, data):
        devices = self._load()
        idx = next((i for i, d in enumerate(devices) if d["id"] == device_id), None)
        if idx is None:
            return {"status": "error", "message": "Device not found"}

        current = devices[idx]
        updated = {
            "id": current["id"],
            "name": (data.get("name", current["name"]) or "").strip(),
            "ip": (data.get("ip", current["ip"]) or "").strip(),
            "type": (data.get("type", current["type"]) or "").strip().lower(),
            "description": (data.get("description", current.get("description", "")) or "").strip(),
            "ssh_id": (data.get("ssh_id", current.get("ssh_id", "")) or "").strip(),
            "ssh_pass": (data.get("ssh_pass", current.get("ssh_pass", "")) or "").strip(),
        }

        if not updated["name"] or not updated["ip"] or updated["type"] not in ("android", "ios"):
            return {"status": "error", "message": "Invalid device payload"}

        devices[idx] = updated
        self._save(devices)
        return {"status": "success", "device": updated}

    def delete_device(self, device_id):
        devices = self._load()
        next_devices = [d for d in devices if d["id"] != device_id]
        if len(next_devices) == len(devices):
            return {"status": "error", "message": "Device not found"}
        self._save(next_devices)
        return {"status": "success", "message": "Device deleted"}
