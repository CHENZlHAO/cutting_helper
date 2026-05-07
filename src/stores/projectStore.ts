import { create } from 'zustand';
import type { Project, VideoClip, VideoInfo } from '@/types';
import client from '@/api/client';

interface ProjectStore {
  projects: Project[];
  currentProject: (Project & { clips: VideoClip[] }) | null;
  videoLibrary: VideoInfo[];
  scannedFolders: string[];        // remember which folders have been scanned
  isLoading: boolean;
  operationProgress: { type: string; percent: number } | null;

  fetchProjects: () => Promise<void>;
  setCurrentProject: (id: number) => Promise<void>;
  createProject: (name: string) => Promise<number>;
  deleteProject: (id: number) => Promise<void>;
  scanFolder: (folderPaths: string[]) => Promise<void>;
  removeFolder: (folderPath: string) => void;
  addClips: (projectId: number, sourcePaths: string[]) => Promise<void>;
  addAllFromFolder: (projectId: number, folderPath: string) => Promise<void>;
  removeClip: (projectId: number, clipId: number) => Promise<void>;
  reorderClips: (projectId: number, clipIds: number[]) => Promise<void>;
  setOperationProgress: (progress: { type: string; percent: number } | null) => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  currentProject: null,
  videoLibrary: [],
  scannedFolders: (() => {
    try {
      const saved = localStorage.getItem('cutting_helper_scanned_folders');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  })(),
  isLoading: false,
  operationProgress: null,

  fetchProjects: async () => {
    set({ isLoading: true });
    const { data } = await client.get('/api/projects');
    set({ projects: data, isLoading: false });
  },

  setCurrentProject: async (id: number) => {
    set({ isLoading: true });
    const { data } = await client.get(`/api/projects/${id}`);
    set({ currentProject: data, isLoading: false });
  },

  createProject: async (name: string) => {
    const { data } = await client.post('/api/projects', { name });
    get().fetchProjects();
    return data.id;
  },

  deleteProject: async (id: number) => {
    await client.delete(`/api/projects/${id}`);
    if (get().currentProject?.id === id) set({ currentProject: null });
    get().fetchProjects();
  },

  scanFolder: async (folderPaths: string[]) => {
    set({ isLoading: true });
    const { data } = await client.post('/api/videos/scan', folderPaths);
    // Merge with existing library to avoid duplicates
    const existing = get().videoLibrary;
    const existingPaths = new Set(existing.map((v: VideoInfo) => v.source_path));
    const newVideos = (data.videos as VideoInfo[]).filter(
      (v: VideoInfo) => !existingPaths.has(v.source_path)
    );
    const nextFolders = [...new Set([...get().scannedFolders, ...folderPaths])];
    localStorage.setItem('cutting_helper_scanned_folders', JSON.stringify(nextFolders));
    set({
      videoLibrary: [...existing, ...newVideos],
      scannedFolders: nextFolders,
      isLoading: false,
    });
  },

  removeFolder: (folderPath: string) => {
    const normalizedFolder = folderPath.endsWith('/') ? folderPath : folderPath + '/';
    set((s) => {
      const nextFolders = s.scannedFolders.filter((f) => f !== folderPath);
      const nextLibrary = s.videoLibrary.filter((v) => !v.source_path.startsWith(normalizedFolder));
      localStorage.setItem('cutting_helper_scanned_folders', JSON.stringify(nextFolders));
      return { scannedFolders: nextFolders, videoLibrary: nextLibrary };
    });
  },

  addClips: async (projectId: number, sourcePaths: string[]) => {
    await client.post(`/api/videos/${projectId}/clips`, sourcePaths, { params: {} });
    await get().setCurrentProject(projectId);
  },

  addAllFromFolder: async (projectId: number, folderPath: string) => {
    const normalizedFolder = folderPath.endsWith('/') ? folderPath : folderPath + '/';
    const folderVideos = get().videoLibrary.filter((v: VideoInfo) =>
      v.source_path.startsWith(normalizedFolder)
    );
    if (folderVideos.length > 0) {
      const paths = folderVideos.map((v: VideoInfo) => v.source_path);
      await get().addClips(projectId, paths);
    }
  },

  removeClip: async (projectId: number, clipId: number) => {
    await client.delete(`/api/videos/${projectId}/clips/${clipId}`);
    await get().setCurrentProject(projectId);
  },

  reorderClips: async (projectId: number, clipIds: number[]) => {
    await client.put(`/api/projects/${projectId}/clips/reorder`, { clip_ids: clipIds });
    await get().setCurrentProject(projectId);
  },

  setOperationProgress: (progress) => set({ operationProgress: progress }),
}));
