export interface Project {
  id: number;
  name: string;
  export_path: string | null;
  created_at: string;
  updated_at: string;
  clips: VideoClip[];
}

export interface VideoClip {
  id: number;
  project_id: number;
  source_path: string;
  filename: string;
  duration: number;
  width: number;
  height: number;
  file_size: number;
  order_index: number;
  first_frames: string[] | null;
  last_frames: string[] | null;
  ai_description: string | null;
  thumbnail?: string;
}

export interface VideoInfo {
  id: number;
  source_path: string;
  filename: string;
  duration: number;
  width: number;
  height: number;
  file_size: number;
  thumbnail: string | null;
}

export interface Transition {
  id: number;
  project_id: number;
  from_clip_id: number;
  to_clip_id: number;
  transition_type: 'ai_generated' | 'crossfade' | 'none';
  video_path: string | null;
  prompt_used: string | null;
  duration: number;
}

export interface LLMProvider {
  id: number;
  name: string;
  base_url: string;
  model_name: string;
  is_default: boolean;
  api_key?: string;
}

export interface VideoModelProvider {
  id: number;
  name: string;
  base_url: string;
  model_name: string;
  is_default: boolean;
  max_duration: number;
  api_key?: string;
}

export interface PlatformAccount {
  id: number;
  platform: string;
  account_name: string;
  is_logged_in: boolean;
}

export interface PublishTask {
  id: number;
  project_id: number;
  platform: string;
  account_name: string;
  video_path: string;
  title: string | null;
  description: string | null;
  tags: string[] | null;
  status: 'pending' | 'uploading' | 'done' | 'failed';
  scheduled_at: string | null;
  result_url: string | null;
  error_message: string | null;
  created_at: string;
}

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  plugin_type: 'video_stylization' | 'image_stylization';
  enabled: boolean;
  parameters_schema: Record<string, unknown>;
}

export interface DoubaoConfig {
  chrome_profile_path: string;
  headless: boolean;
}

export interface WsMessage {
  type: string;
  [key: string]: unknown;
}
