# Cutting Helper — AI 视频剪辑助手

AI 驱动的桌面端视频剪辑辅助工具，支持视频帧分析、智能排序、AI 转场生成、一键多平台发布。

## 功能

- **视频管理**: 添加文件夹，批量导入视频，自动提取元数据
- **帧提取**: 对每个视频自动截取首尾关键帧
- **AI 画面描述**: 通过豆包（浏览器自动化）或 LLM Vision API 识别画面内容
- **智能排序**: 根据画面描述，由 AI 决定最佳视频编排顺序
- **AI 转场生成**: 调用视频模型 API，根据前后帧生成流畅转场动画（无 API 时自动回退 FFmpeg 交叉淡入淡出）
- **视频拼接导出**: 将所有片段及转场串联，输出完整视频
- **一键发布**: 支持 7 个社交平台（抖音、B站、小红书、快手、视频号、百家号、TikTok）
- **插件系统**: 可扩展视频风格化、图片风格化等功能
- **API 管理**: 完整的 LLM 与视频模型 API 密钥管理，密钥加密存储

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Electron |
| 前端 | React + TypeScript + Vite + TailwindCSS |
| 状态管理 | Zustand |
| 后端 | Python FastAPI |
| 数据库 | SQLite (SQLAlchemy) |
| 视频处理 | FFmpeg |
| 浏览器自动化 | Playwright (豆包) |
| AI 接口 | OpenAI 兼容 API |
| 社交发布 | [social-auto-upload](https://github.com/dreammis/social-auto-upload) |

## 环境要求

- Python 3.9+ （已安装）
- Node.js 18+ （已安装）
- FFmpeg （已通过 Homebrew 安装）
- Chrome 浏览器（用于豆包自动化）

## 快速开始

```bash
cd /Users/chenzihao/Desktop/cutting_helper

# 激活虚拟环境
source venv/bin/activate

# 启动后端（端口 8765）
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8765

# 新开终端，启动前端
npm run dev

# 浏览器访问 http://localhost:5173
```

## 项目结构

```
cutting_helper/
├── backend/                # Python 后端
│   ├── main.py            # FastAPI 入口
│   ├── config.py          # 配置
│   ├── database.py        # 数据库
│   ├── models/            # 数据模型 (SQLAlchemy + Pydantic)
│   ├── routers/           # API 路由
│   ├── services/          # 核心服务
│   │   ├── ffmpeg_service.py      # 视频处理
│   │   ├── doubao_service.py      # 豆包自动化
│   │   ├── ai_service.py          # LLM 调用
│   │   ├── video_model_service.py # 视频模型
│   │   ├── ordering_service.py    # AI 排序
│   │   └── publish_service.py     # 社交发布
│   └── plugins/           # 插件系统
├── electron/              # Electron 主进程
├── src/                   # React 前端
│   ├── pages/             # 页面组件
│   ├── stores/            # 状态管理
│   ├── api/               # API 客户端
│   └── components/        # UI 组件
├── social-auto-upload/    # 社交发布子模块
├── data/                  # 运行时数据
├── venv/                  # Python 虚拟环境
├── manual_checklist.md    # 手动操作清单
└── progress.md            # 开发进度
```

## 使用流程

1. **添加视频**: 视频库 → 添加文件夹 → 扫描视频文件
2. **创建项目**: 新建项目 → 添加视频片段
3. **帧提取**: 选择片段 → 点击「截帧」
4. **AI 描述**: 点击「AI 描述」→ 豆包或 LLM Vision 分析画面
5. **智能排序**: 点击「AI 排序」→ AI 推荐最优编排
6. **生成转场**: 点击「生成转场」→ 视频模型创建转场动画
7. **拼接导出**: 输入文件名 → 拼接生成完整视频
8. **发布**: 选择平台 → 填写标题/描述/标签 → 一键发布

## API 配置

在应用的「AI 设置」页面配置：

- **LLM 提供商**: 支持 OpenAI 兼容 API（DeepSeek、OpenAI、豆包 API 等）
- **视频模型提供商**: 支持 OpenAI 兼容视频生成 API
- **豆包自动化**: 使用现有 Chrome 登录状态

## 打包为桌面应用

```bash
npm run electron:build
```

macOS `.dmg` 文件将生成在 `release/` 目录。

## 扩展开发

### 添加插件

在 `backend/plugins/user/` 目录下创建插件：

```
my_plugin/
├── plugin.json     # 清单文件
└── __init__.py     # 插件类
```

- 视频风格化：继承 `VideoStylizationPlugin`
- 图片风格化：继承 `ImageStylizationPlugin`

### 示例插件

- `cinematic_color_grade` — 视频色彩分级
- `image_watermark` — 图片水印
