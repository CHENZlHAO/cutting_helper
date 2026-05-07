#!/bin/bash
# Cutting Helper launcher script
set -e
cd "$(dirname "$0")"
lsof -ti:8765 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null || true
echo "=== Starting backend API (port 8765) ==="
./venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8765 &
BACKEND_PID=$!
sleep 2
echo "=== Starting frontend dev server (port 5173) ==="
npx vite --host 127.0.0.1 &
FRONTEND_PID=$!
echo ""
echo "Backend API: http://127.0.0.1:8765"
echo "Frontend UI: http://127.0.0.1:5173"
echo "API Docs: http://127.0.0.1:8765/docs"
echo "Press Ctrl+C to stop all services"
cleanup() { echo "Stopping..."; kill $BACKEND_PID 2>/dev/null; kill $FRONTEND_PID 2>/dev/null; exit 0; }
trap cleanup SIGINT SIGTERM
wait
