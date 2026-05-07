# 手动操作清单

## 环境准备

### 1. 安装 FFmpeg（已完成 ✓）
- [x] `brew install ffmpeg`

### 2. 安装 Node.js 和 npm（已完成 ✓）
- [x] 已安装 Node.js v25.9.0

### 3. 安装 Python 3.9+ (已完成 ✓)
- [x] 已安装 Python 3.9.6

### 4. 创建虚拟环境并安装依赖（已完成 ✓）
- [x] 虚拟环境位于 `venv/`
- [x] Python 依赖已安装

### 5. 安装 Playwright 浏览器（已完成 ✓）
- [x] Chromium 已安装

### 6. 安装前端依赖（已完成 ✓）
- [x] `npm install` 已完成

## AI API 配置

### 7. 配置 LLM 提供商
- [ ] 打开应用 → AI 设置 → 添加 LLM
- [ ] 输入 DeepSeek/OpenAI/豆包 API 等 API 信息
- [ ] 支持的格式: OpenAI 兼容 API (base_url + api_key + model_name)

### 8. 配置视频模型 API
- [ ] 打开应用 → AI 设置 → 添加视频模型
- [ ] 输入视频生成模型 API 信息（如 Kling API、Runway 等）
- [ ] 支持的格式: OpenAI 兼容 API

### 9. 配置豆包自动化（可选）
- [ ] 确保 Chrome 浏览器已安装
- [ ] 在 Chrome 中登录豆包 (doubao.com)
- [ ] 在 AI 设置中配置 Chrome 用户数据目录
  - macOS 默认路径: `~/Library/Application Support/Google/Chrome`
- [ ] 豆包自动化使用现有 Chrome 登录状态

## 社交平台发布

### 10. 配置 social-auto-upload（如需发布功能）
- [x] social-auto-upload 已克隆到 `social-auto-upload/`
- [ ] 按照 social-auto-upload 文档配置各平台账号
  - 参考: social-auto-upload/CLAUDE.md
- [ ] 在发布页面登录各平台账号

## 运行应用

### 11. 启动后端服务
```bash
cd /Users/chenzihao/Desktop/cutting_helper
source venv/bin/activate
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8765 --reload
```

### 12. 启动前端开发服务器
```bash
cd /Users/chenzihao/Desktop/cutting_helper
npm run dev
```

### 13. 访问应用
- 浏览器访问: http://localhost:5173
- 或使用 Electron 桌面应用（需要打包）:
  ```bash
  npm run electron:dev
  ```

## 打包为桌面应用

### 14. 构建 Electron 应用
```bash
cd /Users/chenzihao/Desktop/cutting_helper
npm run electron:build
```
- macOS .dmg 文件将生成在 `release/` 目录

## 使用流程

1. 添加视频文件夹 → 扫描视频文件
2. 创建项目 → 添加视频片段
3. 截取帧 → AI 描述画面
4. AI 排序 → 生成转场
5. 拼接导出 → 发布到社交平台

## 扩展开发

### 添加新插件
- 在 `backend/plugins/user/` 创建插件目录
- 包含 `plugin.json` 和 `__init__.py`
- 继承 `VideoStylizationPlugin` 或 `ImageStylizationPlugin`

### 添加新的社交平台
- social-auto-upload 已支持 7 个平台
- 新平台需要在 social-auto-upload 中添加 uploader
- 参考 social-auto-upload/uploader/ 目录
