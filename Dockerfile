# Stage 1: Build frontend
FROM node:20-slim AS frontend-builder
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.electron.json vite.config.ts tailwind.config.mjs postcss.config.mjs index.html ./
COPY src/ ./src/
RUN npm run build

# Stage 2: Production runtime
FROM python:3.11-slim
WORKDIR /app

# Install ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy built frontend from stage 1
COPY --from=frontend-builder /src/dist/ ./dist/

# Create data directory
RUN mkdir -p /app/data/frames /app/data/exports /app/data/transitions /app/data/thumbnails

# Expose API port
EXPOSE 8765

# Set environment to production so FastAPI serves static files
ENV CUTTING_HELPER_ENV=production

CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8765"]
