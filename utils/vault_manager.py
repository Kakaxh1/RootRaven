import datetime
import json
import os
import uuid


class VaultManager:
    def __init__(self):
        base_dir = os.path.dirname(os.path.dirname(__file__))
        self.data_dir = os.path.join(base_dir, "data")
        self.vault_file = os.path.join(self.data_dir, "evidence_vault.json")
        os.makedirs(self.data_dir, exist_ok=True)
        if not os.path.exists(self.vault_file):
            self._save([])

    def _load(self):
        try:
            with open(self.vault_file, "r", encoding="utf-8") as fp:
                return json.load(fp)
        except Exception:
            return []

    def _save(self, items):
        with open(self.vault_file, "w", encoding="utf-8") as fp:
            json.dump(items, fp, indent=2)

    def get_all(self, tag=None, category=None):
        items = self._load()
        if tag:
            items = [i for i in items if tag.lower() in [t.lower() for t in i.get("tags", [])]]
        if category:
            items = [i for i in items if i.get("category", "").lower() == category.lower()]
        return items

    def add_item(self, data):
        title = (data.get("title") or "").strip()
        if not title:
            return {"status": "error", "message": "Title is required"}

        item = {
            "id": str(uuid.uuid4()),
            "title": title,
            "category": data.get("category", "General"),  # Credential, Token, Log, Command, Secret, File
            "package": data.get("package", ""),
            "content": data.get("content", ""),
            "tags": data.get("tags", []),
            "created_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }

        items = self._load()
        items.insert(0, item)
        self._save(items)
        return {"status": "success", "item": item}

    def delete_item(self, item_id):
        items = self._load()
        next_items = [i for i in items if i["id"] != item_id]
        if len(next_items) == len(items):
            return {"status": "error", "message": "Item not found"}
        self._save(next_items)
        return {"status": "success", "message": "Item deleted from vault"}

    def export_markdown(self):
        items = self._load()
        md = ["# RootRaven Evidence Vault Export\n", f"Generated: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n", "---\n"]
        for i in items:
            md.append(f"## {i['title']}")
            md.append(f"**Category**: {i.get('category')} | **App**: {i.get('package', 'Global')} | **Date**: {i.get('created_at')}")
            if i.get("tags"):
                md.append(f"**Tags**: `{'`, `'.join(i['tags'])}`")
            md.append(f"\n```\n{i.get('content', '')}\n```\n---\n")
        return "\n".join(md)
