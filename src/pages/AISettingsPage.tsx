import { useState, useEffect } from 'react';
import { Plus, Trash2, Check, X, RefreshCw } from 'lucide-react';
import { useAISettingsStore } from '@/stores/aiSettingsStore';
import type { LLMProvider, VideoModelProvider } from '@/types';

export default function AISettingsPage() {
  const {
    llmProviders, videoModelProviders, doubaoConfig,
    fetchLLMProviders, createLLMProvider, updateLLMProvider, deleteLLMProvider, testLLMProvider,
    fetchVideoModelProviders, createVideoModelProvider, updateVideoModelProvider, deleteVideoModelProvider, testVideoModelProvider,
    fetchDoubaoConfig, updateDoubaoConfig,
  } = useAISettingsStore();

  const [showLLMForm, setShowLLMForm] = useState(false);
  const [showVMForm, setShowVMForm] = useState(false);

  useEffect(() => {
    fetchLLMProviders();
    fetchVideoModelProviders();
    fetchDoubaoConfig();
  }, []);

  return (
    <div className="p-6 max-w-3xl page-enter">
      <h1 className="text-2xl font-bold text-warm-800 mb-6">AI 设置</h1>

      {/* LLM Providers */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-warm-800">语言模型 (LLM)</h2>
          <button
            onClick={() => setShowLLMForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-gradient-to-r from-primary-400 to-primary-500 hover:from-primary-500 hover:to-primary-600 text-white rounded-2xl shadow-soft hover:shadow-glow transition-all"
          >
            <Plus size={14} /> 添加
          </button>
        </div>

        {llmProviders.length === 0 ? (
          <p className="text-warm-400 text-sm py-8 text-center border-2 border-dashed border-primary-200 rounded-3xl bg-white/60 font-medium">
            尚未配置 LLM。添加一个 OpenAI 兼容的 API 提供商（如 DeepSeek、OpenAI、豆包 API 等）。
          </p>
        ) : (
          <div className="space-y-3">
            {llmProviders.map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                onTest={async () => {
                  const r = await testLLMProvider(p.id);
                  alert(`${r.success ? '✓' : '✗'} ${r.message}`);
                }}
                onDelete={() => deleteLLMProvider(p.id)}
                onSetDefault={(id) => updateLLMProvider(id, { is_default: true })}
              />
            ))}
          </div>
        )}

        {showLLMForm && (
          <ProviderForm
            type="llm"
            onClose={() => setShowLLMForm(false)}
            onSubmit={async (data) => {
              await createLLMProvider(data as any);
              setShowLLMForm(false);
            }}
          />
        )}
      </section>

      {/* Video Model Providers */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-warm-800">视频生成模型 (OpenAI 兼容)</h2>
          <button
            onClick={() => setShowVMForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-gradient-to-r from-primary-400 to-primary-500 hover:from-primary-500 hover:to-primary-600 text-white rounded-2xl shadow-soft hover:shadow-glow transition-all"
          >
            <Plus size={14} /> 添加
          </button>
        </div>

        {videoModelProviders.length === 0 ? (
          <p className="text-warm-400 text-sm py-8 text-center border-2 border-dashed border-primary-200 rounded-3xl bg-white/60 font-medium">
            尚未配置视频生成模型。添加 OpenAI 兼容的视频模型 API 提供商（如 Kling API、Runway 等）。
          </p>
        ) : (
          <div className="space-y-3">
            {videoModelProviders.map((p) => (
              <ProviderCard
                key={p.id}
                provider={{ ...p, max_duration: undefined as any }}
                onTest={async () => {
                  const r = await testVideoModelProvider(p.id);
                  alert(`${r.success ? '✓' : '✗'} ${r.message}`);
                }}
                onDelete={() => deleteVideoModelProvider(p.id)}
                onSetDefault={(id) => updateVideoModelProvider(id, { is_default: true })}
              />
            ))}
          </div>
        )}

        {showVMForm && (
          <ProviderForm
            type="video"
            onClose={() => setShowVMForm(false)}
            onSubmit={async (data) => {
              await createVideoModelProvider(data as any);
              setShowVMForm(false);
            }}
          />
        )}
      </section>

      {/* Kling AI Status */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-warm-800 mb-4">Kling AI 视频生成</h2>
        <div className="bg-white rounded-2xl p-5 border border-primary-100/30 shadow-soft">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-mint-500 animate-pulse-soft" />
            <span className="text-sm font-bold text-warm-700">已配置</span>
            <span className="text-xs text-warm-400">转场生成将使用 Kling AI</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-primary-50/50 rounded-xl px-3 py-2">
              <span className="text-warm-400">模型</span>
              <p className="text-warm-700 font-semibold mt-0.5">kling-v1-6</p>
            </div>
            <div className="bg-primary-50/50 rounded-xl px-3 py-2">
              <span className="text-warm-400">模式</span>
              <p className="text-warm-700 font-semibold mt-0.5">image-to-video (JWT 认证)</p>
            </div>
          </div>
          <p className="text-[11px] text-warm-400 mt-3">
            Access Key 和 Secret Key 已在后端配置中预设。生成转场时自动调用 Kling image2video API。
          </p>
        </div>
      </section>

      {/* Doubao Config */}
      <section>
        <h2 className="text-lg font-bold text-warm-800 mb-4">豆包 (Doubao) 自动化</h2>
        <div className="bg-white rounded-2xl p-5 border border-primary-100/30 shadow-soft space-y-3">
          <div>
            <label className="text-sm font-semibold text-warm-600 block mb-1.5">Chrome 用户数据目录</label>
            <input
              className="w-full px-4 py-2.5 bg-primary-50/30 rounded-2xl border border-primary-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-200 outline-none text-sm text-warm-800 placeholder:text-warm-300 transition-all"
              placeholder="~/Library/Application Support/Google/Chrome"
              value={doubaoConfig.chrome_profile_path}
              onChange={(e) => updateDoubaoConfig({ chrome_profile_path: e.target.value })}
            />
            <p className="text-xs text-warm-400 mt-1.5">
              使用现有 Chrome 用户数据以复用豆包的登录状态
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-warm-600 font-medium">
            <input
              type="checkbox"
              checked={doubaoConfig.headless}
              onChange={(e) => updateDoubaoConfig({ headless: e.target.checked })}
              className="rounded accent-primary-500"
            />
            无头模式（后台运行浏览器）
          </label>
        </div>
      </section>
    </div>
  );
}

function ProviderCard({ provider, onTest, onDelete, onSetDefault }: {
  provider: LLMProvider | VideoModelProvider;
  onTest: () => void;
  onDelete: () => void;
  onSetDefault: (id: number) => void;
}) {
  return (
    <div className="bg-white rounded-2xl p-4 flex items-center gap-3 border border-primary-100/30 card-hover">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-warm-800 flex items-center gap-2">
          {provider.name}
          {provider.is_default && (
            <span className="text-xs bg-primary-100 text-primary-600 px-2 py-0.5 rounded-full font-semibold">默认</span>
          )}
        </div>
        <div className="text-xs text-warm-400 truncate">{provider.base_url}</div>
        <div className="text-xs text-warm-300">{provider.model_name}</div>
      </div>
      <div className="flex gap-1">
        <button onClick={onTest} className="p-2 text-warm-400 hover:text-mint-500 hover:bg-mint-50 rounded-xl transition-all" title="测试连接">
          <Check size={14} />
        </button>
        <button
          onClick={() => onSetDefault(provider.id)}
          className={`p-2 rounded-xl transition-all ${provider.is_default ? 'text-primary-500' : 'text-warm-400 hover:text-primary-400 hover:bg-primary-50'}`}
          title="设为默认"
        >
          <Check size={14} />
        </button>
        <button onClick={onDelete} className="p-2 text-warm-400 hover:text-red-400 hover:bg-red-50 rounded-xl transition-all" title="删除">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function ProviderForm({ type, onClose, onSubmit }: {
  type: 'llm' | 'video';
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [maxDuration, setMaxDuration] = useState(10);

  const handleSubmit = async () => {
    await onSubmit({
      name, base_url: baseUrl, api_key: apiKey, model_name: modelName,
      is_default: isDefault, max_duration: maxDuration,
    });
  };

  return (
    <div className="fixed inset-0 bg-warm-800/20 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-3xl p-6 w-96 shadow-soft-lg border border-primary-100/30 animate-scale-in">
        <h2 className="text-lg font-bold text-warm-800 mb-4">
          {type === 'llm' ? '添加 LLM 提供商' : '添加视频模型提供商'}
        </h2>
        <div className="space-y-3">
          <input className="w-full px-4 py-2.5 bg-primary-50/30 rounded-2xl border border-primary-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-200 outline-none text-sm text-warm-800 placeholder:text-warm-300 transition-all"
            placeholder="名称 (如 DeepSeek)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="w-full px-4 py-2.5 bg-primary-50/30 rounded-2xl border border-primary-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-200 outline-none text-sm text-warm-800 placeholder:text-warm-300 transition-all"
            placeholder="API 地址 (如 https://api.deepseek.com/v1)" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          <input className="w-full px-4 py-2.5 bg-primary-50/30 rounded-2xl border border-primary-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-200 outline-none text-sm text-warm-800 placeholder:text-warm-300 transition-all"
            placeholder="API Key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <input className="w-full px-4 py-2.5 bg-primary-50/30 rounded-2xl border border-primary-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-200 outline-none text-sm text-warm-800 placeholder:text-warm-300 transition-all"
            placeholder="模型名称 (如 deepseek-chat)" value={modelName} onChange={(e) => setModelName(e.target.value)} />
          {type === 'video' && (
            <input className="w-full px-4 py-2.5 bg-primary-50/30 rounded-2xl border border-primary-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-200 outline-none text-sm text-warm-800 placeholder:text-warm-300 transition-all"
              placeholder="最大生成时长 (秒)" type="number" value={maxDuration} onChange={(e) => setMaxDuration(parseInt(e.target.value))} />
          )}
          <label className="flex items-center gap-2 text-sm text-warm-600 font-medium">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="accent-primary-500" />
            设为默认
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-warm-500 hover:text-warm-700 hover:bg-warm-50 rounded-2xl transition-all">取消</button>
          <button onClick={handleSubmit} className="px-5 py-2.5 text-sm font-bold bg-gradient-to-r from-primary-400 to-primary-500 hover:from-primary-500 hover:to-primary-600 text-white rounded-2xl shadow-soft hover:shadow-glow transition-all">添加</button>
        </div>
      </div>
    </div>
  );
}
