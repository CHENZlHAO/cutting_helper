import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from backend.database import init_db
from backend.routers import projects, videos, frames, ai, transitions, concatenation, publish, ai_settings, plugins
from backend.services.websocket_manager import ws_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(title="CuttingHelper Backend", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(videos.router, prefix="/api/videos", tags=["videos"])
app.include_router(frames.router, prefix="/api/frames", tags=["frames"])
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])
app.include_router(transitions.router, prefix="/api/transitions", tags=["transitions"])
app.include_router(concatenation.router, prefix="/api/concatenate", tags=["concatenate"])
app.include_router(publish.router, prefix="/api/publish", tags=["publish"])
app.include_router(ai_settings.router, prefix="/api/ai-settings", tags=["ai-settings"])
app.include_router(plugins.router, prefix="/api/plugins", tags=["plugins"])


# Serve static frontend in production/Docker
DIST_DIR = Path(__file__).parent.parent / "dist"
if os.getenv("CUTTING_HELPER_ENV") == "production" and DIST_DIR.exists():
    # Mount assets first (immutable, hashed filenames)
    assets_dir = DIST_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
    # Serve index.html for all other routes (SPA fallback)
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        from fastapi.responses import FileResponse
        file_path = DIST_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(DIST_DIR / "index.html")

@app.get("/api/health", response_model=dict)
async def health():
    return {"status": "ok", "version": "1.0.0"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            _ = await websocket.receive_json()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)
