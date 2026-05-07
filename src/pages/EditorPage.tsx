import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  GripVertical, Image, MessageSquare, ListOrdered,
  ArrowRightLeft, Combine, Download, Plus, X, FolderOpen, Loader2, Play, CheckCircle, XCircle, Square, Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useProjectStore } from '@/stores/projectStore';
import { wsManager } from '@/api/websocket';
import ProgressBar from '@/components/ProgressBar/ProgressBar';
import VideoPreviewModal from '@/components/VideoPreviewModal/VideoPreviewModal';
import client from '@/api/client';
import type { VideoClip, Transition, VideoInfo } from '@/types';

export default function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = parseInt(projectId || '0');
  const {
    currentProject, setCurrentProject,
    operationProgress, setOperationProgress,
    videoLibrary, scannedFolders,
  } = useProjectStore();
  const [activeTab, setActiveTab] = useState<'frames' | 'ai' | 'export'>('frames');
  const [selectedClip, setSelectedClip] = useState<VideoClip | null>(null);
  const [ordering, setOrdering] = useState<{ order: number[]; reasoning: string } | null>(null);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [exportName, setExportName] = useState('');
  const [exportedPath, setExportedPath] = useState('');
  const [showAddVideos, setShowAddVideos] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());
  const [validation, setValidation] = useState<Record<string, { label: string; ok: boolean; detail: string }>>({});
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineStep, setPipelineStep] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const extractAbortRef = useRef<AbortController | null>(null);
  const describeAbortRef = useRef<AbortController | null>(null);
  const orderingAbortRef = useRef<AbortController | null>(null);
  const transitionsAbortRef = useRef<AbortController | null>(null);
  const concatAbortRef = useRef<AbortController | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [bgmPath, setBgmPath] = useState('');

  // Connect WebSocket and listen for progress updates
  useEffect(() => {
    wsManager.connect();

    const unsubProgress = wsManager.on('ffmpeg_progress', (data: any) => {
      setOperationProgress({ type: data.operation, percent: Math.round(data.percent) });
    });
    const unsubAi = wsManager.on('ai_progress', (data: any) => {
      if (data.status === 'done') {
        setOperationProgress({ type: data.operation, percent: 100 });
      } else {
        setOperationProgress({ type: data.operation, percent: 0 });
      }
    });
    const unsubDoubao = wsManager.on('doubao_progress', (data: any) => {
      setOperationProgress({ type: 'describe', percent: 0 });
    });
    const unsubError = wsManager.on('error', (data: any) => {
      toast.error(data.message || '操作失败');
      setOperationProgress(null);
    });

    return () => {
      unsubProgress();
      unsubAi();
      unsubDoubao();
      unsubError();
      wsManager.disconnect();
    };
  }, []);

  useEffect(() => {
    if (pid) initProject(pid);
  }, [pid]);

  async function initProject(id: number) {
    await setCurrentProject(id);
  }

  async function fetchValidation() {
    if (!pid) return;
    try {
      const { data } = await client.get(`/api/projects/${pid}/validate`);
      setValidation(data.steps);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (currentProject) fetchValidation();
  }, [currentProject?.updated_at, currentProject?.clips?.length]);

  const cancelPipeline = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    // Also cancel any individual operation that might be running
    for (const ref of [extractAbortRef, describeAbortRef, orderingAbortRef, transitionsAbortRef, concatAbortRef]) {
      if (ref.current) {
        ref.current.abort();
        ref.current = null;
      }
    }
    setPipelineRunning(false);
    setPipelineStep('');
    setOperationProgress(null);
    toast.error('已取消流程');
  }, []);

  async function runPipeline() {
    if (!currentProject || pipelineRunning) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setPipelineRunning(true);

    const clipIds = currentProject.clips.map((c) => c.id);
    const projectName = currentProject.name || '导出视频';

    const steps = [
      {
        key: 'extract_frames', label: '帧提取', timeout: 300000,
        fn: async (signal: AbortSignal) => {
          await client.post('/api/frames/extract',
            { clip_ids: clipIds, num_frames: 3, position: 'both' },
            { signal, timeout: 300000 });
        },
      },
      {
        key: 'ai_describe', label: 'AI 描述', timeout: 600000,
        fn: async (signal: AbortSignal) => {
          await client.post('/api/ai/describe-frames',
            { clip_ids: clipIds, provider: 'gemini' },
            { signal, timeout: 600000 });
        },
      },
      {
        key: 'ai_ordering', label: 'AI 排序', timeout: 120000,
        fn: async (signal: AbortSignal) => {
          const { data } = await client.post('/api/ai/ordering', null,
            { params: { project_id: pid }, signal, timeout: 120000 });
          if (data.order && data.order.length > 0) {
            await client.put(`/api/projects/${pid}/clips/reorder`,
              { clip_ids: data.order }, { signal, timeout: 15000 });
          }
        },
      },
      {
        key: 'generate_transitions', label: '转场生成', timeout: 300000,
        fn: async (signal: AbortSignal) => {
          // Check if video model provider exists; fallback to crossfade
          let transitionType = 'ai';
          try {
            const { data: vms } = await client.get('/api/ai-settings/video-model',
              { signal, timeout: 5000 });
            if (!vms || vms.length === 0) transitionType = 'crossfade';
          } catch {
            transitionType = 'crossfade';
          }
          await client.post('/api/transitions/generate',
            { transition_type: transitionType, duration: 2.0 },
            { params: { project_id: pid }, signal, timeout: 300000 });
        },
      },
      {
        key: 'concatenate', label: '拼接导出', timeout: 600000,
        fn: async (signal: AbortSignal) => {
          const outName = `${projectName}_${new Date().toISOString().slice(0, 10)}`;
          const { data } = await client.post(`/api/concatenate/project/${pid}`,
            { output_name: outName, bgm_path: bgmPath || undefined },
            { signal, timeout: 600000 });
          setExportedPath(data.output_path);
        },
      },
    ];

    for (const step of steps) {
      if (controller.signal.aborted) break;
      setPipelineStep(step.label);
      setOperationProgress({ type: step.key, percent: 0 });
      try {
        await step.fn(controller.signal);
        setOperationProgress({ type: step.key, percent: 100 });
      } catch (e: any) {
        if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED' || controller.signal.aborted) {
          break;
        }
        toast.error(`${step.label}失败: ${e?.response?.data?.detail || e?.message || '未知错误'}`);
        setOperationProgress(null);
        break;
      }
      if (step.key === 'concatenate') {
        await setCurrentProject(pid);
      }
    }

    abortRef.current = null;
    setPipelineStep('');
    setPipelineRunning(false);
    setOperationProgress(null);
    if (!controller.signal.aborted) {
      await setCurrentProject(pid);
      await fetchValidation();
      toast.success('一键流程完成！');
    }
  }

  async function handleAddVideos() {
    if (selectedToAdd.size === 0) return;
    const { addClips } = useProjectStore.getState();
    await addClips(pid, Array.from(selectedToAdd));
    setSelectedToAdd(new Set());
    setShowAddVideos(false);
    await setCurrentProject(pid);
  }

  async function handleExtractFrames() {
    if (!currentProject) return;
    if (extractAbortRef.current) {
      extractAbortRef.current.abort();
      extractAbortRef.current = null;
      setOperationProgress(null);
      return;
    }
    const controller = new AbortController();
    extractAbortRef.current = controller;
    setOperationProgress({ type: 'extract_frames', percent: 0 });
    try {
      const clipIds = currentProject.clips.map((c) => c.id);
      await client.post('/api/frames/extract', {
        clip_ids: clipIds,
        num_frames: 3,
        position: 'both',
      }, { signal: controller.signal });
      setOperationProgress({ type: 'extract_frames', percent: 100 });
      toast.success('帧提取完成');
      await setCurrentProject(pid);
      fetchValidation();
    } catch (e: any) {
      if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') {
        toast.error(e?.response?.data?.detail || '帧提取失败');
      }
    }
    extractAbortRef.current = null;
    setTimeout(() => setOperationProgress(null), 800);
  }

  async function handleDescribeFrames(provider: 'doubao' | 'llm' | 'gemini') {
    if (!currentProject) return;
    if (describeAbortRef.current) {
      describeAbortRef.current.abort();
      describeAbortRef.current = null;
      setOperationProgress(null);
      return;
    }
    const controller = new AbortController();
    describeAbortRef.current = controller;
    setOperationProgress({ type: 'describe', percent: 0 });
    try {
      const clipIds = currentProject.clips.map((c) => c.id);
      await client.post('/api/ai/describe-frames', {
        clip_ids: clipIds,
        provider,
      }, { signal: controller.signal });
      setOperationProgress({ type: 'describe', percent: 100 });
      toast.success('AI 描述完成');
      await setCurrentProject(pid);
      fetchValidation();
    } catch (e: any) {
      if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') {
        toast.error(e?.response?.data?.detail || 'AI 描述失败');
      }
    }
    describeAbortRef.current = null;
    setTimeout(() => setOperationProgress(null), 800);
  }

  async function handleAIOrdering() {
    if (!currentProject) return;
    if (orderingAbortRef.current) {
      orderingAbortRef.current.abort();
      orderingAbortRef.current = null;
      setOperationProgress(null);
      return;
    }
    const controller = new AbortController();
    orderingAbortRef.current = controller;
    setOperationProgress({ type: 'ordering', percent: 0 });
    try {
      const { data } = await client.post('/api/ai/ordering', null, {
        params: { project_id: pid },
        signal: controller.signal,
      });
      setOrdering(data);
      setActiveTab('ai');
      setOperationProgress({ type: 'ordering', percent: 100 });
      toast.success('AI 排序完成');
      fetchValidation();
    } catch (e: any) {
      if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') {
        toast.error(e?.response?.data?.detail || 'AI 排序失败');
      }
    }
    orderingAbortRef.current = null;
    setTimeout(() => setOperationProgress(null), 800);
  }

  async function handleApplyOrdering() {
    if (!currentProject || !ordering) return;
    await client.put(`/api/projects/${pid}/clips/reorder`, {
      clip_ids: ordering.order,
    });
    setOrdering(null);
    await setCurrentProject(pid);
    toast.success('排序已应用');
  }

  async function handleGenerateTransitions() {
    if (!currentProject) return;
    if (transitionsAbortRef.current) {
      transitionsAbortRef.current.abort();
      transitionsAbortRef.current = null;
      setOperationProgress(null);
      return;
    }
    const controller = new AbortController();
    transitionsAbortRef.current = controller;
    setOperationProgress({ type: 'transitions', percent: 0 });
    try {
      await client.post('/api/transitions/generate', {
        transition_type: 'ai',
        duration: 2.0,
      }, { params: { project_id: pid }, signal: controller.signal });
      const { data } = await client.get(`/api/transitions/project/${pid}`);
      setTransitions(data);
      setActiveTab('ai');
      setOperationProgress({ type: 'transitions', percent: 100 });
      toast.success(`已生成 ${data.length} 个转场`);
      fetchValidation();
    } catch (e: any) {
      if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') {
        toast.error(e?.response?.data?.detail || '转场生成失败');
      }
    }
    transitionsAbortRef.current = null;
    setTimeout(() => setOperationProgress(null), 800);
  }

  async function handleConcatenate() {
    if (!currentProject || !exportName) return;
    if (concatAbortRef.current) {
      concatAbortRef.current.abort();
      concatAbortRef.current = null;
      setOperationProgress(null);
      return;
    }
    const controller = new AbortController();
    concatAbortRef.current = controller;
    setOperationProgress({ type: 'concatenate', percent: 0 });
    try {
      const { data } = await client.post(`/api/concatenate/project/${pid}`, {
        output_name: exportName,
        bgm_path: bgmPath || undefined,
      }, { signal: controller.signal });
      setExportedPath(data.output_path);
      setOperationProgress({ type: 'concatenate', percent: 100 });
      toast.success('视频导出成功');
      fetchValidation();
    } catch (e: any) {
      if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') {
        toast.error(e?.response?.data?.detail || '导出失败');
      }
    }
    concatAbortRef.current = null;
    setTimeout(() => setOperationProgress(null), 800);
  }

  const isOperating = operationProgress !== null;
  const isIndividuallyRunning =
    extractAbortRef.current !== null ||
    describeAbortRef.current !== null ||
    orderingAbortRef.current !== null ||
    transitionsAbortRef.current !== null ||
    concatAbortRef.current !== null;

  // Get videos not yet in the project
  const existingPaths = new Set(currentProject?.clips.map((c) => c.source_path) || []);
  const availableVideos = videoLibrary.filter((v) => !existingPaths.has(v.source_path));

  const videosByFolder = new Map<string, VideoInfo[]>();
  for (const v of availableVideos) {
    let folder = scannedFolders.find((f) => {
      const nf = f.endsWith('/') ? f : f + '/';
      return v.source_path.startsWith(nf);
    });
    if (!folder) {
      const parts = v.source_path.split('/');
      parts.pop();
      folder = parts.join('/');
    }
    if (!videosByFolder.has(folder)) videosByFolder.set(folder, []);
    videosByFolder.get(folder)!.push(v);
  }

  if (!currentProject) {
    return (
      <div className="p-6 page-enter">
        <h1 className="text-2xl font-bold text-warm-800 mb-2">编辑器</h1>
        <p className="text-warm-400">请在视频库中选择或创建一个项目</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Progress bar */}
      <ProgressBar />

      <div className="flex flex-1 min-h-0">
        {/* Timeline (left) */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <div className="flex items-center gap-2 p-4 border-b border-primary-100/60 bg-white/70 backdrop-blur-lg">
            <div className="flex-1 text-lg font-bold text-warm-800 truncate">{currentProject.name}</div>
            <div className="flex items-center gap-1">
              {/* One-click pipeline button + prominent cancel */}
              <div className="flex items-center gap-2 mr-2">
                <button
                  onClick={runPipeline}
                  disabled={(isOperating || isIndividuallyRunning) && !pipelineRunning || currentProject.clips.length === 0}
                  className={`flex items-center gap-2 px-5 py-2 text-sm font-bold rounded-2xl transition-all duration-200 ${
                    pipelineRunning
                      ? 'bg-mint-100 text-mint-600 border border-mint-200'
                      : 'bg-gradient-to-r from-primary-400 via-primary-500 to-lavender-500 hover:from-primary-500 hover:via-primary-600 hover:to-lavender-600 text-white shadow-soft hover:shadow-glow'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  title="一键完成全部流程：截帧 → AI 描述 → AI 排序 → 生成转场 → 拼接导出"
                >
                  {pipelineRunning ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Play size={16} />
                  )}
                  {pipelineRunning ? pipelineStep || '处理中...' : '一键启动'}
                </button>
                {pipelineRunning && (
                  <button
                    onClick={cancelPipeline}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-gradient-to-r from-coral-400 to-coral-500 hover:from-coral-500 hover:to-coral-600 text-white rounded-2xl transition-all shadow-glow animate-pulse"
                    title="立即中止当前流程"
                  >
                    <Square size={16} />
                    停止流程
                  </button>
                )}
              </div>

              <ToolButton
                icon={Image} label="截帧" onClick={handleExtractFrames}
                disabled={(isOperating || pipelineRunning) && !extractAbortRef.current}
                loading={extractAbortRef.current !== null}
                active={operationProgress?.type === 'extract_frames'}
                valid={validation.extract_frames?.ok}
              />
              <div className="relative group">
                <ToolButton
                  icon={MessageSquare} label="AI 描述"
                  onClick={() => handleDescribeFrames('gemini')}
                  disabled={(isOperating || pipelineRunning) && !describeAbortRef.current}
                  loading={describeAbortRef.current !== null}
                  active={operationProgress?.type === 'describe'}
                  valid={validation.ai_describe?.ok}
                />
                <div className="absolute top-full right-0 mt-1 bg-white rounded-2xl shadow-soft-lg border border-primary-100 p-1 hidden group-hover:block z-10">
                  <button onClick={() => handleDescribeFrames('gemini')} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-primary-50 rounded-xl text-warm-700 font-medium">Gemini (推荐)</button>
                  <button onClick={() => handleDescribeFrames('doubao')} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-primary-50 rounded-xl text-warm-600">豆包</button>
                  <button onClick={() => handleDescribeFrames('llm')} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-primary-50 rounded-xl text-warm-600">LLM Vision</button>
                </div>
              </div>
              <ToolButton
                icon={ListOrdered} label="AI 排序" onClick={handleAIOrdering}
                disabled={(isOperating || pipelineRunning) && !orderingAbortRef.current}
                loading={orderingAbortRef.current !== null}
                active={operationProgress?.type === 'ordering'}
                valid={validation.ai_ordering?.ok}
              />
              <ToolButton
                icon={ArrowRightLeft} label="生成转场" onClick={handleGenerateTransitions}
                disabled={(isOperating || pipelineRunning) && !transitionsAbortRef.current}
                loading={transitionsAbortRef.current !== null}
                active={operationProgress?.type === 'transitions'}
                valid={validation.generate_transitions?.ok}
              />
              <ToolButton
                icon={Combine} label="拼接导出" onClick={() => setActiveTab('export')}
                disabled={(isOperating || pipelineRunning) && !concatAbortRef.current}
                active={operationProgress?.type === 'concatenate'}
                valid={validation.concatenate?.ok}
              />
            </div>
          </div>

          {/* Validation status bar */}
          {Object.keys(validation).length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 border-b border-primary-100/40 bg-primary-50/60 overflow-x-auto">
              <span className="text-xs text-warm-500 shrink-0 font-semibold">状态</span>
              {Object.entries(validation).map(([key, s]) => (
                <div key={key} className="flex items-center gap-1 text-xs shrink-0" title={s.detail}>
                  {s.ok
                    ? <CheckCircle size={12} className="text-mint-500" />
                    : <XCircle size={12} className="text-warm-300" />
                  }
                  <span className={s.ok ? 'text-warm-600 font-medium' : 'text-warm-300'}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Clip list */}
          <div className="flex-1 overflow-auto p-4">
            <button
              onClick={() => setShowAddVideos(true)}
              className="w-full flex items-center justify-center gap-2 p-3 mb-4 border-2 border-dashed border-primary-200 hover:border-primary-400 hover:bg-primary-50/50 rounded-2xl text-sm font-semibold text-warm-400 hover:text-primary-500 transition-all"
            >
              <Plus size={16} />
              添加视频到项目
            </button>

            {currentProject.clips.length === 0 ? (
              <p className="text-warm-400 text-center py-8 font-medium">
                暂无片段。点击上方按钮添加视频。
              </p>
            ) : (
              <div className="space-y-2">
                {currentProject.clips.map((clip, idx) => (
                  <div
                    key={clip.id}
                    onClick={() => setSelectedClip(clip)}
                    className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer border transition-all duration-200 ${
                      selectedClip?.id === clip.id
                        ? 'bg-primary-50 border-primary-300 shadow-soft'
                        : 'bg-white/70 border-primary-100/30 hover:border-primary-200 hover:bg-white card-hover'
                    }`}
                  >
                    <GripVertical size={16} className="text-warm-300 cursor-grab shrink-0" />
                    <span className="text-xs text-warm-400 w-6 shrink-0 font-semibold">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-warm-700 truncate">{clip.filename}</div>
                      <div className="text-xs text-warm-400">
                        {formatDuration(clip.duration)} | {clip.width}x{clip.height}
                      </div>
                    </div>
                    {clip.ai_description && (
                      <span className="text-xs bg-mint-100 text-mint-600 px-2 py-0.5 rounded-full font-semibold shrink-0">
                        ✓ 已描述
                      </span>
                    )}
                    {clip.first_frames && (
                      <span className="text-xs bg-primary-100 text-primary-600 px-2 py-0.5 rounded-full font-semibold shrink-0">
                        ✓ 已截帧
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-96 border-l border-primary-100/60 bg-white/40 backdrop-blur-sm flex flex-col shrink-0">
          <div className="flex border-b border-primary-100/60">
            {[
              { id: 'frames' as const, label: '帧 & 描述' },
              { id: 'ai' as const, label: 'AI 排序' },
              { id: 'export' as const, label: '导出' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 p-3 text-sm font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'text-primary-500 border-b-2 border-primary-400 bg-primary-50/50'
                    : 'text-warm-400 hover:text-warm-600 hover:bg-warm-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto p-4">
            {activeTab === 'frames' && <FramesPanel clip={selectedClip} />}
            {activeTab === 'ai' && <AIOrderingPanel ordering={ordering} onApply={handleApplyOrdering} transitions={transitions} />}
            {activeTab === 'export' && (
              <ExportPanel
                exportName={exportName}
                setExportName={setExportName}
                exportedPath={exportedPath}
                onExport={handleConcatenate}
                isOperating={concatAbortRef.current !== null}
                projectId={pid}
                onPreview={() => setShowPreview(true)}
                bgmPath={bgmPath}
                setBgmPath={setBgmPath}
              />
            )}
          </div>
        </div>

        {/* Video Preview Modal */}
        <VideoPreviewModal
          open={showPreview}
          onClose={() => setShowPreview(false)}
          exportedPath={exportedPath}
          projectId={pid}
        />

        {/* Add Videos Modal */}
        {showAddVideos && (
          <div className="fixed inset-0 bg-warm-800/20 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
            <div className="bg-white rounded-3xl p-6 w-[640px] max-h-[80vh] flex flex-col shadow-soft-lg border border-primary-100/30 animate-scale-in">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <h2 className="text-lg font-bold text-warm-800">添加视频到项目</h2>
                <button onClick={() => setShowAddVideos(false)} className="p-2 text-warm-400 hover:text-warm-600 hover:bg-warm-50 rounded-2xl transition-all">
                  <X size={20} />
                </button>
              </div>

              {availableVideos.length === 0 ? (
                <p className="text-warm-400 text-center py-8 font-medium">
                  视频库中所有视频已在项目中，请先在视频库中添加新文件夹。
                </p>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {Array.from(videosByFolder.entries()).map(([folder, videos]) => (
                    <div key={folder} className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FolderOpen size={14} className="text-primary-400" />
                        <span className="text-sm text-warm-500 font-medium truncate">
                          {folder.split('/').pop() || folder}
                        </span>
                        <span className="text-xs text-warm-300">({videos.length})</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {videos.map((v) => {
                          const isSelected = selectedToAdd.has(v.source_path);
                          return (
                            <div
                              key={v.source_path}
                              onClick={() => {
                                setSelectedToAdd((prev) => {
                                  const next = new Set(prev);
                                  isSelected ? next.delete(v.source_path) : next.add(v.source_path);
                                  return next;
                                });
                              }}
                              className={`bg-warm-50 rounded-2xl overflow-hidden cursor-pointer card-hover border transition-all ${
                                isSelected ? 'ring-2 ring-primary-400 border-primary-300 shadow-soft' : 'border-warm-200 hover:border-primary-200'
                              }`}
                            >
                              <div className="aspect-video bg-gradient-to-br from-primary-50 to-lavender-50 flex items-center justify-center relative">
                                <span className="text-lg">🎬</span>
                                <span className="absolute bottom-1 right-1 bg-warm-800/70 text-white text-[10px] px-1.5 py-0.5 rounded-lg">
                                  {formatDuration(v.duration)}
                                </span>
                              </div>
                              <div className="p-1.5">
                                <div className="text-[11px] font-semibold text-warm-700 truncate">{v.filename}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between items-center mt-4 pt-4 border-t border-primary-100/60 shrink-0">
                <span className="text-xs text-warm-500 font-medium">已选 {selectedToAdd.size} 个视频</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddVideos(false)}
                    className="px-5 py-2.5 text-sm font-semibold text-warm-500 hover:text-warm-700 hover:bg-warm-50 rounded-2xl transition-all"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleAddVideos}
                    disabled={selectedToAdd.size === 0}
                    className="px-5 py-2.5 text-sm font-bold bg-gradient-to-r from-primary-400 to-primary-500 hover:from-primary-500 hover:to-primary-600 disabled:from-warm-200 disabled:to-warm-200 disabled:text-warm-400 text-white rounded-2xl shadow-soft hover:shadow-glow transition-all disabled:cursor-not-allowed"
                  >
                    添加 ({selectedToAdd.size})
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolButton({ icon: Icon, label, onClick, disabled, loading, active, valid }: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  active?: boolean;
  valid?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled && !loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-2xl transition-all duration-200 relative font-semibold ${
        loading
          ? 'bg-gradient-to-r from-coral-400 to-coral-500 text-white shadow-glow animate-pulse'
          : active
            ? 'bg-primary-100 text-primary-600'
            : disabled
              ? 'bg-warm-100 text-warm-300 cursor-not-allowed'
              : 'bg-white border border-primary-100 text-warm-600 hover:bg-primary-50 hover:border-primary-200 hover:text-primary-500'
      }`}
      title={loading ? `点击取消 - ${label}` : label}
    >
      {loading ? <Square size={14} /> : <Icon size={14} />}
      <span className="hidden lg:inline">{loading ? '取消' : label}</span>
      {valid !== undefined && (
        <span className="absolute -top-1.5 -right-1.5">
          {valid
            ? <CheckCircle size={12} className="text-mint-500 bg-white rounded-full" />
            : <XCircle size={12} className="text-warm-300 bg-white rounded-full" />
          }
        </span>
      )}
    </button>
  );
}

function FramesPanel({ clip }: { clip: VideoClip | null }) {
  if (!clip) return <p className="text-warm-400 text-sm font-medium">选择一个片段查看帧和描述</p>;
  const frames = [...(clip.first_frames || []), ...(clip.last_frames || [])];
  const API_BASE = 'http://127.0.0.1:8765';
  return (
    <div className="animate-fade-in">
      <h3 className="text-sm font-bold text-warm-700 mb-2">{clip.filename}</h3>
      {frames.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 mb-4">
          {frames.map((f, i) => (
            <img key={i} src={`${API_BASE}/api/frames/file?path=${encodeURIComponent(f)}`} alt={`Frame ${i}`}
              className="aspect-video object-cover rounded-xl bg-warm-100" />
          ))}
        </div>
      )}
      {clip.ai_description ? (
        <div className="text-xs text-warm-600 bg-primary-50/50 rounded-2xl p-3 whitespace-pre-wrap leading-relaxed">
          {clip.ai_description}
        </div>
      ) : frames.length > 0 ? (
        <p className="text-xs text-warm-400 font-medium">尚未生成 AI 描述，点击工具栏「AI 描述」按钮</p>
      ) : (
        <p className="text-xs text-warm-400 font-medium">尚未截帧，点击工具栏「截帧」按钮</p>
      )}
    </div>
  );
}

function AIOrderingPanel({ ordering, onApply, transitions }: {
  ordering: { order: number[]; reasoning: string } | null;
  onApply: () => void;
  transitions: Transition[];
}) {
  return (
    <div className="space-y-4 animate-fade-in">
      {ordering && (
        <div>
          <h3 className="text-sm font-bold text-warm-700 mb-2">AI 推荐排序</h3>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {ordering.order.map((id, idx) => (
              <span key={id} className="px-2 py-1 bg-primary-100 text-primary-600 rounded-xl text-xs font-semibold">
                {idx + 1}. 片段 {id}
              </span>
            ))}
          </div>
          <div className="text-xs text-warm-600 bg-warm-50 rounded-2xl p-3 mb-4 leading-relaxed">
            {ordering.reasoning}
          </div>
          <button
            onClick={onApply}
            className="w-full py-2.5 bg-gradient-to-r from-primary-400 to-primary-500 hover:from-primary-500 hover:to-primary-600 text-white rounded-2xl text-sm font-bold shadow-soft hover:shadow-glow transition-all"
          >
            应用此排序
          </button>
        </div>
      )}

      {transitions.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-warm-700 mb-2">已生成转场 ({transitions.length})</h3>
          <div className="space-y-1.5">
            {transitions.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-xs bg-white rounded-2xl p-2.5 border border-primary-100/30">
                <span className="text-warm-500 truncate">片段 {t.from_clip_id} → 片段 {t.to_clip_id}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                  t.transition_type === 'ai_generated'
                    ? 'bg-lavender-100 text-lavender-600'
                    : 'bg-primary-100 text-primary-600'
                }`}>
                  {t.transition_type === 'ai_generated' ? 'AI' : '交叉淡入淡出'}
                </span>
                {t.video_path && (
                  <span className="text-mint-500 font-semibold ml-auto shrink-0">已生成</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!ordering && transitions.length === 0 && (
        <p className="text-warm-400 text-sm font-medium">点击"AI 排序"生成建议排序，或点击"生成转场"创建转场动画</p>
      )}
    </div>
  );
}

function ExportPanel({ exportName, setExportName, exportedPath, onExport, isOperating, projectId, onPreview, bgmPath, setBgmPath }: {
  exportName: string;
  setExportName: (n: string) => void;
  exportedPath: string;
  onExport: () => void;
  isOperating: boolean;
  projectId: number;
  onPreview: () => void;
  bgmPath: string;
  setBgmPath: (p: string) => void;
}) {
  const API_BASE = 'http://127.0.0.1:8765';
  const filename = exportedPath ? exportedPath.split('/').pop() || 'export.mp4' : 'export.mp4';
  const videoUrl = exportedPath
    ? `${API_BASE}/api/concatenate/project/${projectId}/download/${encodeURIComponent(filename)}`
    : '';
  const bgmFilename = bgmPath ? bgmPath.split('/').pop() || '' : '';

  const handleDownload = async () => {
    try {
      const resp = await fetch(videoUrl);
      if (!resp.ok) throw new Error('Download failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  const handleSelectMusic = async () => {
    if (window.electronAPI) {
      const path = await window.electronAPI.selectFile([
        { name: '音频文件', extensions: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'wma'] },
      ]);
      if (path) setBgmPath(path);
    } else {
      // Web fallback: trigger hidden file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          // In web mode, we only have the file object — pass path if available via webkitRelativePath
          // For local dev, the user would need to enter the path manually
          setBgmPath((file as any).path || file.name);
        }
      };
      input.click();
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">导出视频</h3>
      <input
        className="w-full px-4 py-2.5 bg-primary-50/30 rounded-2xl border border-primary-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-200 outline-none text-sm text-warm-800 placeholder:text-warm-300 mb-3 transition-all"
        placeholder="输出文件名"
        value={exportName}
        onChange={(e) => setExportName(e.target.value)}
        disabled={isOperating}
      />

      {/* BGM Selection */}
      <div className="mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSelectMusic}
            disabled={isOperating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-primary-200 text-warm-600 hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl transition-all"
          >
            <Plus size={14} />
            选择背景音乐
          </button>
          {bgmPath && (
            <div className="flex items-center gap-1 flex-1 min-w-0 bg-primary-50 rounded-xl px-2 py-1">
              <span className="text-xs text-green-400 truncate flex-1" title={bgmPath}>
                {bgmFilename}
              </span>
              <button
                onClick={() => setBgmPath('')}
                disabled={isOperating}
                className="p-0.5 text-warm-400 hover:text-red-400 shrink-0"
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>
        {bgmPath && (
          <p className="text-[11px] text-warm-400 mt-1">
            音乐将自动循环匹配视频长度
          </p>
        )}
      </div>

      <button
        onClick={onExport}
        disabled={!exportName && !isOperating}
        className={`w-full py-2 rounded-lg text-sm mb-3 flex items-center justify-center gap-2 transition-colors ${
          isOperating
            ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse'
            : 'bg-gradient-to-r from-primary-400 to-primary-500 hover:from-primary-500 hover:to-primary-600 disabled:from-warm-200 disabled:to-warm-200 disabled:text-warm-300'
        }`}
      >
        {isOperating ? (
          <Square size={14} />
        ) : (
          <Download size={14} />
        )}
        {isOperating ? '取消导出' : '开始拼接导出'}
      </button>
      {exportedPath && (
        <div className="space-y-3">
          <div className="text-xs text-green-400 bg-green-500/10 rounded-lg p-3 break-all">
            导出成功: {exportedPath}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onPreview}
              className="flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
            >
              <Eye size={14} />
              预览视频
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center justify-center gap-2 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors"
            >
              <Download size={14} />
              下载视频
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
