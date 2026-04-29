import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken } from '../api/client';
import { authAdminApi } from '../api/typed';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail]       = useState('admin@studara.app');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await authAdminApi.login(email, password);
      if (!['admin', 'moderator'].includes(data.user.role)) {
        throw new Error('ليس لديك صلاحية الوصول إلى لوحة الإدارة');
      }
      setToken(data.access, data.refresh);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-emerald-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📚</div>
          <h1 className="text-2xl font-bold text-gray-900">توجيه</h1>
          <p className="text-gray-500 text-sm mt-1">لوحة الإدارة</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm text-right">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 text-right mb-1">البريد الإلكتروني</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-right focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 text-right mb-1">كلمة المرور</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-right focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-green-700 hover:bg-green-800 text-white font-semibold rounded-xl transition disabled:opacity-60 mt-2"
          >
            {loading ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>


      </div>
    </div>
  );
}
