import { useProjectStore } from '@/stores/projectStore';

const OPERATION_LABELS: Record<string, string> = {
  extract_frames: '截取帧',
  describe: 'AI 描述',
  ordering: 'AI 排序',
  transitions: '生成转场',
  concatenate: '拼接导出',
};

export default function ProgressBar() {
  const operationProgress = useProjectStore((s) => s.operationProgress);
  if (!operationProgress) return null;

  const label = OPERATION_LABELS[operationProgress.type] || operationProgress.type;
  const pct = operationProgress.percent;

  return (
    <div className="px-4 py-2.5 bg-white/80 backdrop-blur-lg border-b border-primary-100/60 animate-fade-in">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-warm-600 shrink-0">{label}</span>
        <div className="flex-1 h-2.5 bg-primary-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #f9a8d4, #f472b6, #a78bfa)',
              backgroundSize: '200% 100%',
              animation: pct < 100 ? 'shimmer 1.5s linear infinite' : undefined,
            }}
          />
        </div>
        <span className="text-xs font-semibold text-warm-500 w-10 text-right shrink-0">{pct}%</span>
      </div>
    </div>
  );
}
