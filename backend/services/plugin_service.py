import json
from pathlib import Path
from backend.plugins.base import PluginManifest, VideoStylizationPlugin, ImageStylizationPlugin


class PluginService:
    def __init__(self):
        self._plugins: dict[str, VideoStylizationPlugin | ImageStylizationPlugin] = {}
        self._manifests: dict[str, PluginManifest] = {}
        self._enabled: set[str] = set()
        self._scan_plugins()

    def _get_plugin_dirs(self) -> list[Path]:
        base = Path(__file__).parent.parent / "plugins"
        return [
            base / "builtin" / "video",
            base / "builtin" / "image",
            base / "user",
        ]

    def _scan_plugins(self):
        self._manifests.clear()
        for plugin_dir in self._get_plugin_dirs():
            if not plugin_dir.exists():
                continue
            for manifest_path in plugin_dir.rglob("plugin.json"):
                try:
                    manifest_data = json.loads(manifest_path.read_text())
                    manifest = PluginManifest(**manifest_data)
                    self._manifests[manifest.name] = manifest
                    self._enabled.add(manifest.name)  # Default enabled
                except Exception:
                    pass

    def discover(self) -> list[dict]:
        results = []
        for name, manifest in self._manifests.items():
            results.append({
                "name": manifest.name,
                "version": manifest.version,
                "description": manifest.description,
                "author": manifest.author,
                "plugin_type": manifest.plugin_type,
                "enabled": name in self._enabled,
                "parameters_schema": manifest.parameters_schema,
            })
        return results

    def get(self, name: str):
        return self._plugins.get(name)

    def reload(self):
        self._plugins.clear()
        self._scan_plugins()

    def enable(self, name: str):
        self._enabled.add(name)

    def disable(self, name: str):
        self._enabled.discard(name)
