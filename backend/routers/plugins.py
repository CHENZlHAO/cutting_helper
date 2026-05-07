from pathlib import Path
from fastapi import APIRouter, HTTPException
from backend.services.plugin_service import PluginService

router = APIRouter()
plugin_service = PluginService()


@router.get("")
async def list_plugins():
    return plugin_service.discover()


@router.post("/scan")
async def scan_plugins():
    plugin_service.reload()
    return plugin_service.discover()


@router.put("/{plugin_name}")
async def configure_plugin(plugin_name: str, config: dict):
    plugin = plugin_service.get(plugin_name)
    if not plugin:
        raise HTTPException(404, "Plugin not found")
    # store config (persistent)
    return {"message": "configured", "config": config}


@router.post("/{plugin_name}/apply")
async def apply_plugin(
    plugin_name: str,
    target_type: str,
    target_path: str,
    params: dict = {},
):
    plugin = plugin_service.get(plugin_name)
    if not plugin:
        raise HTTPException(404, "Plugin not found")
    output_path = str(Path(target_path).parent / f"{Path(target_path).stem}_{plugin_name}{Path(target_path).suffix}")
    result = await plugin.process(Path(target_path), Path(output_path), params)
    return {"output_path": str(result)}
