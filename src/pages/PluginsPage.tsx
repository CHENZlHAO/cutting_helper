import { useState, useEffect } from 'react';
import { Puzzle, RefreshCw, Play, Settings, Zap } from 'lucide-react';
import client from '@/api/client';
import type { PluginManifest } from '@/types';

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<(PluginManifest & { enabled: boolean })[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPlugins();
  }, []);

  async function loadPlugins() {
    setIsLoading(true);
    const { data } = await client.get('/api/plugins');
    setPlugins(data);
    setIsLoading(false);
  }

  async function handleScan() {
    setIsLoading(true);
    await client.post('/api/plugins/scan');
    await loadPlugins();
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">插件</h1>
          <p className="text-warm-400 mt-1">扩展功能：视频风格化 / 图片风格化</p>
        </div>
        <button
          onClick={handleScan}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-primary-200 text-warm-600 hover:bg-primary-50 rounded-2xl font-semibold shadow-soft transition-all"
        >
          <RefreshCw size={14} /> 扫描插件
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-warm-400 py-8 justify-center">
          <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          加载中...
        </div>
      ) : plugins.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-primary-200 rounded-lg">
          <Puzzle size={32} className="mx-auto mb-3 text-warm-400" />
          <p className="text-warm-400 mb-2">暂无插件</p>
          <p className="text-warm-400 text-sm">
            在 backend/plugins/user/ 目录下添加插件，然后点击"扫描插件"
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {plugins.map((plugin) => (
            <div key={plugin.name} className="bg-white rounded-2xl p-5 border border-primary-100/30 shadow-soft card-hover">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{plugin.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      plugin.plugin_type === 'video_stylization'
                        ? 'bg-lavender-100 text-lavender-600'
                        : 'bg-primary-100 text-primary-600'
                    }`}>
                      {plugin.plugin_type === 'video_stylization' ? '视频' : '图片'}
                    </span>
                    <span className="text-xs text-warm-400">v{plugin.version}</span>
                  </div>
                  <p className="text-sm text-warm-400 mt-1">{plugin.description}</p>
                  <p className="text-xs text-warm-400 mt-1">作者: {plugin.author}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    className={`px-3 py-1 text-xs rounded-xl font-semibold transition-all ${
                      plugin.enabled
                        ? 'bg-mint-100 text-mint-600'
                        : 'bg-warm-100 text-warm-500'
                    }`}
                  >
                    {plugin.enabled ? '已启用' : '已禁用'}
                  </button>
                </div>
              </div>

              {/* Parameters */}
              {plugin.parameters_schema && Object.keys(plugin.parameters_schema).length > 0 && (
                <div className="mt-3 pt-3 border-t border-primary-200">
                  <p className="text-xs text-warm-400 mb-2">参数:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(
                      (plugin.parameters_schema as any)?.properties || {}
                    ).map(([key, schema]: [string, any]) => (
                      <div key={key} className="text-xs text-warm-400">
                        <span className="text-warm-700">{key}</span>
                        {' '}
                        <span className="text-warm-400">({schema.type})</span>
                        {schema.default !== undefined && (
                          <span className="text-warm-400"> = {String(schema.default)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Development Guide */}
      <div className="mt-8 p-4 bg-lavender-50/80 rounded-lg border border-primary-200">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
          <Zap size={14} className="text-coral-400" />
          插件开发指南
        </h3>
        <p className="text-xs text-warm-400 mb-2">
          每个插件是一个目录，包含 plugin.json 和 __init__.py。继承 VideoStylizationPlugin 或 ImageStylizationPlugin 基类。
        </p>
        <pre className="text-xs text-warm-400 bg-primary-100 rounded p-2 overflow-x-auto">{`plugin/
  plugin.json     # 清单文件
  __init__.py     # 插件入口
`}</pre>
      </div>
    </div>
  );
}
