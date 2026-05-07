import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout/Layout';
import VideoLibraryPage from './pages/VideoLibraryPage';
import EditorPage from './pages/EditorPage';
import AISettingsPage from './pages/AISettingsPage';
import PublishPage from './pages/PublishPage';
import PluginsPage from './pages/PluginsPage';
import { useBackendHealth } from './hooks/useBackendHealth';

function BackendStatusGate({ children }: { children: React.ReactNode }) {
  const { isReady, error } = useBackendHealth();

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-blush-50 via-white to-cream-50">
        <div className="text-center animate-fade-in">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <span className="text-3xl text-red-400 font-bold">!</span>
          </div>
          <h1 className="text-xl font-bold text-warm-800 mb-2">后端服务未启动</h1>
          <p className="text-warm-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-blush-50 via-white to-cream-50">
        <div className="text-center animate-fade-in">
          <div className="w-14 h-14 mx-auto mb-4 border-[3px] border-primary-300 border-t-primary-500 rounded-full animate-spin" />
          <p className="text-warm-500 font-medium">正在连接后端服务...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BackendStatusGate>
      <Layout>
        <Routes>
          <Route path="/" element={<VideoLibraryPage />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/editor/:projectId" element={<EditorPage />} />
          <Route path="/ai-settings" element={<AISettingsPage />} />
          <Route path="/publish" element={<PublishPage />} />
          <Route path="/publish/:projectId" element={<PublishPage />} />
          <Route path="/plugins" element={<PluginsPage />} />
        </Routes>
      </Layout>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'rgba(255, 255, 255, 0.95)',
            color: '#4a3f47',
            borderRadius: '14px',
            boxShadow: '0 4px 20px rgba(244, 114, 182, 0.18), 0 1px 3px rgba(0,0,0,0.06)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(244, 114, 182, 0.15)',
            fontSize: '14px',
          },
        }}
      />
    </BackendStatusGate>
  );
}
