import { create } from 'zustand';
import type { LLMProvider, VideoModelProvider, DoubaoConfig } from '@/types';
import client from '@/api/client';

interface AISettingsStore {
  llmProviders: LLMProvider[];
  videoModelProviders: VideoModelProvider[];
  doubaoConfig: DoubaoConfig;
  isLoading: boolean;

  fetchLLMProviders: () => Promise<void>;
  createLLMProvider: (data: Partial<LLMProvider> & { api_key: string }) => Promise<void>;
  updateLLMProvider: (id: number, data: Partial<LLMProvider>) => Promise<void>;
  deleteLLMProvider: (id: number) => Promise<void>;
  testLLMProvider: (id: number) => Promise<{ success: boolean; message: string }>;

  fetchVideoModelProviders: () => Promise<void>;
  createVideoModelProvider: (data: Partial<VideoModelProvider> & { api_key: string }) => Promise<void>;
  updateVideoModelProvider: (id: number, data: Partial<VideoModelProvider>) => Promise<void>;
  deleteVideoModelProvider: (id: number) => Promise<void>;
  testVideoModelProvider: (id: number) => Promise<{ success: boolean; message: string }>;

  fetchDoubaoConfig: () => Promise<void>;
  updateDoubaoConfig: (config: Partial<DoubaoConfig>) => Promise<void>;
}

export const useAISettingsStore = create<AISettingsStore>((set, get) => ({
  llmProviders: [],
  videoModelProviders: [],
  doubaoConfig: { chrome_profile_path: '', headless: true },
  isLoading: false,

  fetchLLMProviders: async () => {
    set({ isLoading: true });
    const { data } = await client.get('/api/ai-settings/llm');
    set({ llmProviders: data, isLoading: false });
  },

  createLLMProvider: async (payload) => {
    await client.post('/api/ai-settings/llm', payload);
    get().fetchLLMProviders();
  },

  updateLLMProvider: async (id, payload) => {
    await client.put(`/api/ai-settings/llm/${id}`, payload);
    get().fetchLLMProviders();
  },

  deleteLLMProvider: async (id) => {
    await client.delete(`/api/ai-settings/llm/${id}`);
    get().fetchLLMProviders();
  },

  testLLMProvider: async (id) => {
    const { data } = await client.post('/api/ai-settings/llm/test', null, { params: { provider_id: id } });
    return data;
  },

  fetchVideoModelProviders: async () => {
    const { data } = await client.get('/api/ai-settings/video-model');
    set({ videoModelProviders: data });
  },

  createVideoModelProvider: async (payload) => {
    await client.post('/api/ai-settings/video-model', payload);
    get().fetchVideoModelProviders();
  },

  updateVideoModelProvider: async (id, payload) => {
    await client.put(`/api/ai-settings/video-model/${id}`, payload);
    get().fetchVideoModelProviders();
  },

  deleteVideoModelProvider: async (id) => {
    await client.delete(`/api/ai-settings/video-model/${id}`);
    get().fetchVideoModelProviders();
  },

  testVideoModelProvider: async (id) => {
    const { data } = await client.post('/api/ai-settings/video-model/test', null, { params: { provider_id: id } });
    return data;
  },

  fetchDoubaoConfig: async () => {
    try {
      const { data } = await client.get('/api/ai-settings/doubao');
      set({ doubaoConfig: data });
    } catch {
      // use defaults if backend unreachable
    }
  },

  updateDoubaoConfig: async (config) => {
    set((s) => ({ doubaoConfig: { ...s.doubaoConfig, ...config } }));
    try {
      await client.put('/api/ai-settings/doubao', config);
    } catch {
      // silently fail if backend unreachable
    }
  },
}));
