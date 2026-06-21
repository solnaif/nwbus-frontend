import { Routes, Route, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'
import { useAuth } from './context/AuthContext'

// Pages
import LoginPage        from './pages/LoginPage'
import DashboardPage    from './pages/DashboardPage'
import TransportationPage from './pages/TransportationPage'
import LostFoundPage    from './pages/LostFoundPage'
import SalesPage        from './pages/SalesPage'
import ReportsPage      from './pages/ReportsPage'
import UsersPage        from './pages/UsersPage'
import StationsPage     from './pages/StationsPage'
import LiveBoard        from './pages/LiveBoard'

// Layout
import AppLayout        from './components/layout/AppLayout'
import LoadingSpinner   from './components/shared/LoadingSpinner'

function RequireAuth({ children, allowedRoles }) {
  const { session, profile, loading, signOut } = useAuth()
  if (loading) return <LoadingSpinner />

  // Not authenticated
  if (!session) return <Navigate to="/login" replace />

  // Session exists but profile failed to load (e.g. RLS issue)
  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50 text-center">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-lg font-bold text-gray-700 mb-2">تعذّر تحميل بيانات الحساب</h2>
          <p className="text-sm text-gray-500 mb-6">يرجى تسجيل الخروج والمحاولة مجدداً. إذا استمرت المشكلة تواصل مع المدير.</p>
          <button
            onClick={() => signOut().then(() => window.location.href = '/login')}
            className="bg-nwbus-primary text-white px-6 py-2 rounded-lg text-sm w-full"
          >
            تسجيل خروج
          </button>
        </div>
      </div>
    )
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/" replace />
  }
  return children
}

export default function App() {
  const { profile } = useAuth()
  const { i18n } = useTranslation()

  // Sync language & direction with user preference
  useEffect(() => {
    if (profile?.language) {
      i18n.changeLanguage(profile.language)
      localStorage.setItem('nwbus_lang', profile.language)
    }
    const lang = profile?.language || localStorage.getItem('nwbus_lang') || 'ar'
    document.documentElement.lang = lang
    document.documentElement.dir  = lang === 'ar' ? 'rtl' : 'ltr'
  }, [profile?.language])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* شاشة العرض الحيّة — ملء الشاشة بدون قائمة */}
      <Route path="/board" element={
        <RequireAuth><LiveBoard /></RequireAuth>
      } />

      <Route path="/" element={
        <RequireAuth>
          <AppLayout />
        </RequireAuth>
      }>
        <Route index element={<DashboardPage />} />
        <Route path="transportation" element={<TransportationPage />} />
        <Route path="lost-found"     element={<LostFoundPage />} />
        <Route path="sales"          element={<SalesPage />} />
        <Route path="reports"        element={
          <RequireAuth allowedRoles={['general_admin', 'station_admin', 'accountant']}>
            <ReportsPage />
          </RequireAuth>
        } />
        <Route path="users"    element={
          <RequireAuth allowedRoles={['general_admin', 'station_admin']}>
            <UsersPage />
          </RequireAuth>
        } />
        <Route path="stations" element={
          <RequireAuth allowedRoles={['general_admin']}>
            <StationsPage />
          </RequireAuth>
        } />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
