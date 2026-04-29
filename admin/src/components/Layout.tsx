import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { clearToken } from '../api/client';

const NAV = [
  { to: '/',           icon: '📊', label: 'لوحة التحكم'   },
  { to: '/resources',  icon: '📁', label: 'الموارد'        },
  { to: '/users',      icon: '👥', label: 'المستخدمون'     },
  { to: '/reminders',  icon: '🔔', label: 'التذكيرات'      },
  { to: '/badges',     icon: '🏅', label: 'الإنجازات'      },
  { to: '/jobs',        icon: '💼', label: 'فرص العمل'       },
  { to: '/curriculum',  icon: '📚', label: 'المناهج'          },
  { to: '/housing',     icon: '🏠', label: 'سكن الطلاب'       },
  { to: '/daily-challenge', icon: '🎲', label: 'التحدي اليومي'    },
  { to: '/password-resets', icon: '🔑', label: 'كلمات المرور'      },
  { to: '/faculty-changes', icon: '🎓', label: 'تغيير التخصص'     },
  { to: '/drive-import',    icon: '📥', label: 'Import Drive'      },
  { to: '/academic-structure', icon: '🏫', label: 'الهيكل الأكاديمي'  },
  { to: '/premium-requests',   icon: '💎', label: 'طلبات الاشتراك'      },
  { to: '/subscriptions',      icon: '🎟️', label: 'إدارة الاشتراكات'    },
  { to: '/ai-usage',           icon: '🤖', label: 'استخدام Ara IA'       },
  { to: '/feature-flags',      icon: '🧩', label: 'تفعيل/تعطيل الميزات'   },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    clearToken();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-gray-50" dir="rtl">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-l border-gray-100 flex flex-col shadow-sm h-screen sticky top-0">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-600 flex items-center justify-center text-white font-bold text-lg">
              ت
            </div>
            <div>
              <div className="font-bold text-gray-900 text-sm">Studara</div>
              <div className="text-xs text-gray-400">لوحة الإدارة</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }: { isActive: boolean }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition"
          >
            <span className="text-base">🚪</span>
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-100 px-8 py-4">
          <div className="text-xs text-gray-400">
            منصة Studara • لوحة تحكم المشرفين
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-8 py-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
