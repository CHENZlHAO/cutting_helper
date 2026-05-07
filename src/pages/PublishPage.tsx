import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Share2, Upload, LogIn, CheckCircle, XCircle, Clock } from 'lucide-react';
import client from '@/api/client';
import { useProjectStore } from '@/stores/projectStore';
import type { PlatformAccount, PublishTask } from '@/types';

const PLATFORMS = [
  { id: 'douyin', name: '抖音', color: '#ff0050' },
  { id: 'bilibili', name: 'B站', color: '#00a1d6' },
  { id: 'xiaohongshu', name: '小红书', color: '#ff2442' },
  { id: 'kuaishou', name: '快手', color: '#ff4906' },
  { id: 'wechat_channels', name: '视频号', color: '#07c160' },
  { id: 'baijiahao', name: '百家号', color: '#4e6ef2' },
  { id: 'tiktok', name: 'TikTok', color: '#000000' },
];

export default function PublishPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { projects, fetchProjects } = useProjectStore();
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [tasks, setTasks] = useState<PublishTask[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<number>(parseInt(projectId || '0'));
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    fetchProjects();
    loadAccounts();
    loadTasks();
  }, []);

  async function loadAccounts() {
    const { data } = await client.get('/api/publish/accounts');
    setAccounts(data);
  }

  async function loadTasks() {
    const { data } = await client.get('/api/publish/tasks');
    setTasks(data);
  }

  async function handleLogin(platform: string) {
    const accountName = prompt(`输入 ${platform} 账户名称:`);
    if (!accountName) return;
    const { data } = await client.post('/api/publish/accounts/login', null, {
      params: { platform, account_name: accountName },
    });
    alert(data.message);
    loadAccounts();
  }

  function togglePlatform(platformId: string) {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      next.has(platformId) ? next.delete(platformId) : next.add(platformId);
      return next;
    });
  }

  async function handlePublish() {
    if (!selectedProjectId || selectedPlatforms.size === 0) {
      alert('请选择项目和至少一个平台');
      return;
    }
    setIsPublishing(true);
    const platforms = Array.from(selectedPlatforms).map((p) => ({
      platform: p,
      account_name: accounts.find((a) => a.platform === p)?.account_name || 'default',
      title,
      description,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    }));
    await client.post('/api/publish/upload', {
      project_id: selectedProjectId,
      platforms,
    });
    await loadTasks();
    setIsPublishing(false);
    alert('发布任务已创建！');
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="p-6 max-w-4xl page-enter">
      <h1 className="text-2xl font-bold text-warm-800 mb-6">一键发布</h1>

      {/* Project Selection */}
      <div className="mb-6">
        <label className="text-sm text-warm-400 block mb-2">选择项目</label>
        <select
          value={selectedProjectId || ''}
          onChange={(e) => setSelectedProjectId(parseInt(e.target.value))}
          className="w-full px-3 py-2 bg-white rounded-2xl border border-primary-100/30 border border-primary-200 focus:border-primary-500 outline-none text-sm"
        >
          <option value="">-- 选择项目 --</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name} {p.export_path ? '(已导出)' : '(未导出)'}</option>
          ))}
        </select>
        {selectedProject?.export_path && (
          <p className="text-xs text-green-400 mt-1">导出文件: {selectedProject.export_path}</p>
        )}
      </div>

      {/* Video Metadata */}
      <div className="grid grid-cols-1 gap-3 mb-6">
        <input
          className="w-full px-3 py-2 bg-white rounded-2xl border border-primary-100/30 border border-primary-200 focus:border-primary-500 outline-none text-sm"
          placeholder="视频标题" value={title} onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="w-full px-3 py-2 bg-white rounded-2xl border border-primary-100/30 border border-primary-200 focus:border-primary-500 outline-none text-sm"
          placeholder="视频描述" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
        />
        <input
          className="w-full px-3 py-2 bg-white rounded-2xl border border-primary-100/30 border border-primary-200 focus:border-primary-500 outline-none text-sm"
          placeholder="标签（用逗号分隔）" value={tags} onChange={(e) => setTags(e.target.value)}
        />
      </div>

      {/* Platform Grid */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">选择发布平台</h2>
        <div className="grid grid-cols-4 gap-3">
          {PLATFORMS.map((plat) => {
            const account = accounts.find((a) => a.platform === plat.id);
            const isSelected = selectedPlatforms.has(plat.id);
            return (
              <button
                key={plat.id}
                onClick={() => togglePlatform(plat.id)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  isSelected
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-primary-200 bg-white hover:border-primary-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{plat.name}</span>
                  {account?.is_logged_in ? (
                    <CheckCircle size={14} className="text-green-400" />
                  ) : (
                    <XCircle size={14} className="text-warm-400" />
                  )}
                </div>
                {account ? (
                  <span className="text-xs text-warm-400">{account.account_name}</span>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleLogin(plat.id); }}
                    className="text-xs flex items-center gap-1 text-primary-400 hover:text-primary-300"
                  >
                    <LogIn size={10} /> 登录
                  </button>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Publish Button */}
      <button
        onClick={handlePublish}
        disabled={isPublishing || !selectedProjectId || selectedPlatforms.size === 0}
        className="flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-warm-200 disabled:text-warm-300 disabled:text-warm-400 rounded-lg font-medium"
      >
        <Upload size={18} />
        {isPublishing ? '发布中...' : '一键发布'}
      </button>

      {/* Publish History */}
      {tasks.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3">发布历史</h2>
          <div className="space-y-2">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-primary-100/30">
                <span className="text-sm">{task.platform}</span>
                <span className="text-xs text-warm-400">{task.account_name}</span>
                {task.status === 'done' && <CheckCircle size={14} className="text-green-400" />}
                {task.status === 'failed' && <XCircle size={14} className="text-red-400" />}
                {task.status === 'uploading' && <Clock size={14} className="text-yellow-400 animate-pulse" />}
                {task.status === 'pending' && <Clock size={14} className="text-warm-400" />}
                <span className="text-xs text-warm-400 ml-auto">
                  {new Date(task.created_at).toLocaleString()}
                </span>
                {task.result_url && (
                  <a href={task.result_url} target="_blank" className="text-xs text-primary-400" rel="noreferrer">
                    查看
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
