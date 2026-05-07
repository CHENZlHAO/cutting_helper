import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderPlus, Plus, Trash2, FolderOpen, Check, X, Loader2 } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import type { VideoInfo } from '@/types';

export default function VideoLibraryPage() {
  const navigate = useNavigate();
  const {
    projects, videoLibrary, scannedFolders, isLoading,
    fetchProjects, createProject, deleteProject, scanFolder, addAllFromFolder, removeFolder,
  } = useProjectStore();

  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedFolderIndex, setSelectedFolderIndex] = useState(0);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [existingProjectId, setExistingProjectId] = useState<number | null>(null);

  useEffect(() => {
    fetchProjects();
    const saved = localStorage.getItem('cutting_helper_scanned_folders');
    if (saved) {
      try {
        const folders: string[] = JSON.parse(saved);
        const currentFolders = useProjectStore.getState().scannedFolders;
        const toScan = folders.filter((f) => !currentFolders.includes(f));
        if (toScan.length > 0) scanFolder(toScan);
      } catch { /* ignore */ }
    }
  }, []);

  const handleFoldersAdded = async (paths: string[]) => {
    if (paths.length > 0) await scanFolder(paths);
  };

  const handleBrowseFolder = async () => {
    if (window.electronAPI?.selectDirectory) {
      const folder = await window.electronAPI.selectDirectory();
      if (folder) await scanFolder([folder]);
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      (input as any).webkitdirectory = true;
      input.onchange = (e: any) => {
        const files: FileList = e.target.files;
        if (files.length > 0) {
          const dirName = (files[0] as any).webkitRelativePath?.split('/')[0] || '';
          const path = prompt(`检测到文件夹 "${dirName}"。请输入完整的文件夹路径:`);
          if (path) scanFolder([path]);
        }
      };
      input.click();
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    const id = await createProject(newProjectName.trim());
    if (scannedFolders.length > 0 && selectedFolderIndex < scannedFolders.length) {
      await addAllFromFolder(id, scannedFolders[selectedFolderIndex]);
    }
    setShowNewProject(false);
    setNewProjectName('');
    navigate(`/editor/${id}`);
  };

  const toggleVideoSelection = (sourcePath: string) => {
    setSelectedVideos((prev) => {
      const next = new Set(prev);
      next.has(sourcePath) ? next.delete(sourcePath) : next.add(sourcePath);
      return next;
    });
  };

  const selectAllInFolder = (folderPath: string) => {
    const normalizedFolder = folderPath.endsWith('/') ? folderPath : folderPath + '/';
    const folderVideos = videoLibrary.filter((v) =>
      v.source_path.startsWith(normalizedFolder)
    );
    setSelectedVideos(new Set(folderVideos.map((v) => v.source_path)));
  };

  const handleAddSelectedToProject = async () => {
    if (selectedVideos.size === 0) return;
    const pathArray = Array.from(selectedVideos);
    if (existingProjectId) {
      const { addClips } = useProjectStore.getState();
      await addClips(existingProjectId, pathArray);
      setSelectedVideos(new Set());
      alert(`已添加 ${pathArray.length} 个片段`);
    } else {
      const name = prompt('为新项目命名:');
      if (!name) return;
      const id = await createProject(name.trim());
      const { addClips } = useProjectStore.getState();
      await addClips(id, pathArray);
      setSelectedVideos(new Set());
      navigate(`/editor/${id}`);
    }
  };

  const videosByFolder = new Map<string, VideoInfo[]>();
  for (const v of videoLibrary) {
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

  return (
    <div className="p-6 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-warm-800">视频库</h1>
          <p className="text-warm-400 mt-1">管理你的视频素材和项目</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowNewProject(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary-400 to-primary-500 hover:from-primary-500 hover:to-primary-600 text-white rounded-2xl font-semibold shadow-soft hover:shadow-glow transition-all duration-200"
          >
            <Plus size={18} />
            新建项目
          </button>
        </div>
      </div>

      {/* Drop Zone */}
      <DropZone onFoldersAdded={handleFoldersAdded} onBrowse={handleBrowseFolder} isLoading={isLoading} />

      {/* New Project Modal */}
      {showNewProject && (
        <div className="fixed inset-0 bg-warm-800/20 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 w-[440px] shadow-soft-lg border border-primary-100/30 animate-scale-in">
            <h2 className="text-lg font-bold text-warm-800 mb-4">新建项目</h2>

            <label className="text-sm font-semibold text-warm-600 block mb-1.5">项目名称</label>
            <input
              autoFocus
              className="w-full px-4 py-2.5 bg-primary-50/30 rounded-2xl border border-primary-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-200 outline-none text-sm text-warm-800 placeholder:text-warm-300 mb-4 transition-all"
              placeholder="输入项目名称"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
            />

            {scannedFolders.length > 0 && (
              <>
                <label className="text-sm font-semibold text-warm-600 block mb-1.5">
                  选择素材文件夹
                </label>
                <div className="space-y-1 max-h-32 overflow-y-auto mb-2">
                  {scannedFolders.map((folder, idx) => {
                    const normalizedFolder = folder.endsWith('/') ? folder : folder + '/';
                    const count = videoLibrary.filter((v) =>
                      v.source_path.startsWith(normalizedFolder)
                    ).length;
                    return (
                      <button
                        key={folder}
                        onClick={() => setSelectedFolderIndex(idx)}
                        className={`w-full text-left px-3 py-2 rounded-2xl text-sm flex items-center justify-between transition-all ${
                          selectedFolderIndex === idx
                            ? 'bg-primary-50 border border-primary-300'
                            : 'bg-warm-50/50 border border-warm-200 hover:border-primary-200'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <FolderOpen size={14} className="shrink-0 text-primary-400" />
                          <span className="truncate text-warm-700">{folder.split('/').pop() || folder}</span>
                        </span>
                        <span className="text-xs text-warm-400 shrink-0 ml-2">{count} 个视频</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-warm-400 mb-4">也可留空，稍后在编辑器中添加视频</p>
              </>
            )}

            {scannedFolders.length === 0 && (
              <p className="text-xs text-warm-400 mb-4">
                尚未添加任何文件夹。请先关闭此窗口，拖拽或点击上方区域导入视频素材。
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewProject(false)}
                className="px-5 py-2.5 text-sm font-semibold text-warm-500 hover:text-warm-700 hover:bg-warm-50 rounded-2xl transition-all"
              >
                取消
              </button>
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim()}
                className="px-5 py-2.5 text-sm font-bold bg-gradient-to-r from-primary-400 to-primary-500 hover:from-primary-500 hover:to-primary-600 disabled:from-warm-200 disabled:to-warm-200 disabled:text-warm-400 text-white rounded-2xl shadow-soft hover:shadow-glow transition-all disabled:cursor-not-allowed"
              >
                创建项目
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Projects Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-warm-700">项目</h2>
        </div>
        {projects.length === 0 ? (
          <p className="text-warm-400 py-8 text-center border-2 border-dashed border-primary-200 rounded-3xl bg-white/60">
            暂无项目，点击「新建项目」开始
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => navigate(`/editor/${p.id}`)}
                className="bg-white rounded-2xl p-4 cursor-pointer card-hover border border-primary-100/40 animate-fade-in-up"
              >
                <div className="h-1.5 -mx-4 -mt-4 mb-3 rounded-t-2xl bg-gradient-to-r from-primary-300 via-lavender-300 to-coral-300" />
                <div className="text-sm font-bold text-warm-800 mb-1 truncate">{p.name}</div>
                <div className="text-xs text-warm-400">{p.clips?.length || 0} 个片段</div>
                <div className="flex justify-end mt-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }}
                    className="p-1.5 text-warm-300 hover:text-red-400 hover:bg-red-50 rounded-xl transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Videos Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-warm-700">视频文件</h2>
          {selectedVideos.size > 0 && (
            <div className="flex items-center gap-2 animate-fade-in">
              <span className="text-xs text-warm-500 font-medium">已选 {selectedVideos.size} 个</span>
              <button
                onClick={handleAddSelectedToProject}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gradient-to-r from-primary-400 to-primary-500 text-white rounded-2xl font-semibold shadow-soft hover:shadow-glow transition-all"
              >
                <Plus size={12} /> 添加到项目
              </button>
              <button
                onClick={() => setSelectedVideos(new Set())}
                className="p-1.5 text-warm-400 hover:text-warm-600 hover:bg-warm-100 rounded-xl transition-all"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-warm-400 py-12 justify-center">
            <div className="w-5 h-5 border-2 border-primary-300 border-t-primary-500 rounded-full animate-spin" />
            <span className="font-medium">扫描中...</span>
          </div>
        ) : videoLibrary.length === 0 ? (
          <p className="text-warm-400 py-12 text-center border-2 border-dashed border-primary-200 rounded-3xl bg-white/60">
            拖拽或点击上方区域导入视频素材文件夹
          </p>
        ) : (
          <div className="space-y-6">
            {Array.from(videosByFolder.entries()).map(([folder, videos]) => (
              <div key={folder} className="animate-fade-in-up">
                <div className="flex items-center gap-2 mb-2">
                  <FolderOpen size={14} className="text-primary-400" />
                  <span className="text-sm text-warm-500 truncate">{folder}</span>
                  <span className="text-xs text-warm-300">({videos.length} 个视频)</span>
                  <button
                    onClick={() => selectAllInFolder(folder)}
                    className="text-xs text-primary-500 hover:text-primary-600 font-semibold ml-2"
                  >
                    全选
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`确定要移除文件夹 "${folder.split('/').pop() || folder}" 及其所有视频吗？`)) {
                        removeFolder(folder);
                      }
                    }}
                    className="p-1 text-warm-300 hover:text-red-400 rounded-lg ml-auto transition-colors"
                    title="移除文件夹"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-3">
                  {videos.map((v) => {
                    const isSelected = selectedVideos.has(v.source_path);
                    return (
                      <div
                        key={v.source_path}
                        onClick={() => toggleVideoSelection(v.source_path)}
                        className={`bg-white rounded-2xl overflow-hidden cursor-pointer card-hover border transition-all duration-200 ${
                          isSelected
                            ? 'ring-2 ring-primary-400 ring-offset-2 ring-offset-blush-50 border-primary-300 shadow-soft'
                            : 'border-primary-100/30 hover:border-primary-200'
                        }`}
                      >
                        <div className="aspect-video bg-gradient-to-br from-primary-50 to-lavender-50 flex items-center justify-center relative">
                          <span className="text-3xl">🎬</span>
                          <div className={`absolute top-2 left-2 w-5 h-5 rounded-lg flex items-center justify-center border-2 transition-all ${
                            isSelected
                              ? 'bg-primary-400 border-primary-400 shadow-glow'
                              : 'border-warm-300 bg-white/70'
                          }`}>
                            {isSelected && <Check size={12} className="text-white" />}
                          </div>
                          <span className="absolute bottom-1 right-1 bg-warm-800/70 text-white text-[10px] px-1.5 py-0.5 rounded-lg font-medium">
                            {formatDuration(v.duration)}
                          </span>
                        </div>
                        <div className="p-2.5">
                          <div className="text-xs font-semibold text-warm-700 truncate" title={v.filename}>{v.filename}</div>
                          <div className="text-[10px] text-warm-400 mt-0.5">{v.width}x{v.height}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* Drop Zone component */
function DropZone({ onFoldersAdded, onBrowse, isLoading }: {
  onFoldersAdded: (paths: string[]) => void;
  onBrowse: () => void;
  isLoading: boolean;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setIsProcessing(true);

    const paths: string[] = [];
    if (window.electronAPI) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i] as any;
        if (file.path) {
          const result = await window.electronAPI.getDroppedPath!(file.path);
          if (result.exists && result.isDirectory) {
            paths.push(file.path);
          }
        }
      }
    } else {
      for (const item of e.dataTransfer.items) {
        const entry = (item as any).webkitGetAsEntry?.();
        if (entry?.isDirectory) {
          const dirName = entry.name;
          const path = prompt(`检测到文件夹 "${dirName}"。请输入完整的文件夹路径:`);
          if (path) paths.push(path);
          break; // Only handle first folder in web mode
        }
      }
    }

    if (paths.length > 0) await onFoldersAdded(paths);
    setIsProcessing(false);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onBrowse}
      className={`
        relative border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer mb-6
        transition-all duration-300
        ${isDragOver
          ? 'border-primary-400 bg-primary-50/80 scale-[1.02] shadow-glow'
          : 'border-primary-200/60 bg-white/60 hover:border-primary-300 hover:bg-primary-50/40'
        }
        ${isProcessing ? 'opacity-70 pointer-events-none' : ''}
      `}
      style={isDragOver ? { animation: 'dropzone-glow 1.5s ease-in-out infinite' } : undefined}
    >
      <div className="flex flex-col items-center gap-3">
        <div className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all duration-300 ${
          isDragOver
            ? 'bg-gradient-to-br from-primary-400 to-lavender-400 text-white shadow-glow scale-110'
            : 'bg-primary-100 text-primary-400'
        }`}>
          {isProcessing || isLoading ? (
            <Loader2 size={28} className="animate-spin" />
          ) : (
            <FolderPlus size={28} />
          )}
        </div>
        <div>
          <p className="text-sm font-bold text-warm-700">
            {isDragOver ? '✨ 松开以添加文件夹' : '拖拽文件夹到此处'}
          </p>
          <p className="text-xs text-warm-400 mt-1">
            或点击此区域浏览文件夹
          </p>
        </div>
      </div>
      {isProcessing && (
        <div className="absolute inset-0 bg-white/90 rounded-3xl flex items-center justify-center animate-fade-in">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-[3px] border-primary-300 border-t-primary-500 rounded-full animate-spin" />
            <span className="text-sm font-semibold text-warm-600">正在扫描...</span>
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
