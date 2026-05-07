import asyncio
import json
from fastapi import WebSocket


class WebSocketManager:
    def __init__(self):
        self.connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.connections:
            self.connections.remove(websocket)

    async def broadcast(self, data: dict):
        payload = json.dumps(data)
        dead = []
        for ws in self.connections:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def send_progress(self, operation: str, percent: float, **extra):
        await self.broadcast({"type": "ffmpeg_progress", "operation": operation, "percent": percent, **extra})

    async def send_doubao_progress(self, clip_id: int, frame_index: int, status: str):
        await self.broadcast({"type": "doubao_progress", "clip_id": clip_id, "frame_index": frame_index, "status": status})

    async def send_ai_progress(self, operation: str, status: str, message: str = ""):
        await self.broadcast({"type": "ai_progress", "operation": operation, "status": status, "message": message})

    async def send_publish_progress(self, platform: str, task_id: int, status: str, percent: float = 0):
        await self.broadcast({"type": "publish_progress", "platform": platform, "task_id": task_id, "status": status, "percent": percent})

    async def send_error(self, message: str, code: str = ""):
        await self.broadcast({"type": "error", "message": message, "code": code})


ws_manager = WebSocketManager()
