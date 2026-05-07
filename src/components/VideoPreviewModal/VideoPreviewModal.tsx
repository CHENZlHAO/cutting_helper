import { useEffect, useRef } from 'react';
import { X, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { API_BASE } from '@/api/client';

interface VideoPreviewModalProps {
  open: boolean;
  onClose: () => void;
  exportedPath: string;
  projectId: number;
}

export default function VideoPreviewModal({
  open,
  onClose,
  exportedPath,
  projectId,
}: VideoPreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open || !exportedPath) return null;

  const filename = exportedPath.split('/').pop() || 'export.mp4';
  const videoUrl = `${API_BASE}/api/concatenate/project/${projectId}/download/${encodeURIComponent(filename)}`;

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
      toast.success('下载已开始');
    } catch {
      toast.error('下载失败');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-warm-800/30 backdrop-blur-md animate-fade-in">
      <div className="bg-white rounded-3xl shadow-soft-lg w-[90vw] max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-primary-100/40 animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-primary-100/60 shrink-0 bg-gradient-to-r from-blush-50 to-white">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-warm-800">视频预览</h2>
            <p className="text-xs text-warm-400 truncate">{filename}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-400 to-primary-500 hover:from-primary-500 hover:to-primary-600 text-white rounded-2xl text-sm font-semibold transition-all duration-200 shadow-soft hover:shadow-glow"
            >
              <Download size={16} />
              下载视频
            </button>
            <button
              onClick={onClose}
              className="p-2 text-warm-400 hover:text-warm-700 hover:bg-primary-50 rounded-2xl transition-all"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Video */}
        <div className="flex-1 flex items-center justify-center bg-warm-50 p-4 min-h-0 rounded-b-3xl">
          <video
            ref={videoRef}
            controls
            autoPlay
            className="max-w-full max-h-full rounded-2xl"
            style={{ maxHeight: 'calc(90vh - 120px)' }}
          >
            <source src={videoUrl} type="video/mp4" />
            您的浏览器不支持视频播放
          </video>
        </div>
      </div>
    </div>
  );
}
