import { NavLink } from 'react-router-dom';
import { Film, Edit, Cpu, Share2, Puzzle } from 'lucide-react';

const navItems = [
  { to: '/', icon: Film, label: '视频库' },
  { to: '/editor', icon: Edit, label: '编辑器' },
  { to: '/ai-settings', icon: Cpu, label: 'AI 设置' },
  { to: '/publish', icon: Share2, label: '发布' },
  { to: '/plugins', icon: Puzzle, label: '插件' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gradient-to-br from-blush-50 via-white to-cream-50">
      {/* Sidebar */}
      <aside className="w-16 bg-white/70 backdrop-blur-xl border-r border-primary-100/60 flex flex-col items-center py-5 gap-3 shrink-0 shadow-soft z-10">
        {/* Brand mark */}
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-400 to-lavender-400 flex items-center justify-center mb-1 shadow-glow">
          <span className="text-white text-xs font-bold">CH</span>
        </div>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-br from-primary-400 to-primary-500 text-white shadow-glow scale-105'
                  : 'text-warm-400 hover:text-primary-400 hover:bg-primary-50 hover:scale-105'
              }`
            }
            title={label}
          >
            <Icon size={20} />
          </NavLink>
        ))}

        {/* Decorative stickers */}
        <div className="mt-auto flex flex-col items-center gap-1 pb-2">
          <span className="sticker sticker-float text-lg">🌸</span>
          <span className="sticker sticker-float-delayed text-xs">✨</span>
          <span className="sticker sticker-float-slow text-sm">💖</span>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
