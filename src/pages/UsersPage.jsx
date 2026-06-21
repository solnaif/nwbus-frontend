import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { USER_ROLES, MODULES } from '../utils/constants'
import { toLatinDigits } from '../utils/digits'
import { isRestStation } from '../utils/stations'

const JOB_TITLES = [
  { value: 'area_supervisor',    ar: 'مشرف منطقة',  en: 'Area Supervisor' },
  { value: 'station_supervisor', ar: 'مشرف محطة',   en: 'Station Supervisor' },
  { value: 'customer_service',   ar: 'خدمة عملاء',  en: 'Customer Service' },
  { value: 'dispatcher',         ar: 'مرحّل',        en: 'Dispatcher' },
]

const ROLE_COLORS = {
  general_admin:   'bg-red-100 text-red-700 border-red-200',
  station_admin:   'bg-amber-100 text-amber-700 border-amber-200',
  accountant:      'bg-blue-100 text-blue-700 border-blue-200',
  station_employee:'bg-gray-100 text-gray-600 border-gray-200',
}

/* ─── User Modal ────────────────────────────────────────── */
function UserModal({ user, stations, supervisors, onClose, onSaved }) {
  const { profile, isGeneralAdmin, isStationAdmin } = useAuth()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  // station_admin can only create employees/accountants for their station
  const allowedRoles = isGeneralAdmin
    ? USER_ROLES
    : USER_ROLES.filter(r => ['station_employee', 'accountant'].includes(r.value))

  const [form, setForm] = useState({
    job_number:      user?.job_number      ?? '',
    username:        user?.username        ?? '',
    password:        '',
    full_name_ar:    user?.full_name_ar    ?? '',
    full_name_en:    user?.full_name_en    ?? '',
    role:            user?.role            ?? 'station_employee',
    station_id:      user?.station_id      ?? (isStationAdmin ? profile.station_id : ''),
    supervisor_id:   user?.supervisor_id   ?? '',
    phone:           user?.phone           ?? '',
    job_title:       user?.job_title        ?? '',
    is_accountant:   user?.is_accountant   ?? false,
    language:        user?.language        ?? 'ar',
    is_active:       user?.is_active       ?? true,
    allowed_modules: user?.allowed_modules ?? null,
  })
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [showPass, setShowPass] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // محطات المشرف المتعددة (station_admin) — تُحفظ في user_stations
  const [stationSet, setStationSet] = useState(new Set(user?.station_id ? [user.station_id] : []))
  useEffect(() => {
    if (user?.id && user.role === 'station_admin') {
      supabase.from('user_stations').select('station_id').eq('user_id', user.id)
        .then(({ data }) => { if (data?.length) setStationSet(new Set(data.map(r => r.station_id))) })
    }
  }, [user?.id])
  const toggleStation = sid => setStationSet(prev => {
    const n = new Set(prev); n.has(sid) ? n.delete(sid) : n.add(sid); return n
  })
  async function syncStations(uid) {
    await supabase.from('user_stations').delete().eq('user_id', uid)
    const ids = [...stationSet]
    if (ids.length) await supabase.from('user_stations').insert(ids.map(sid => ({ user_id: uid, station_id: sid })))
  }
  // المحطة الأساسية للمشرف = أول محطة مختارة (للتوافق مع station_id)
  const primaryStation = () =>
    (form.role === 'station_admin' && stationSet.size) ? [...stationSet][0] : (form.station_id || null)

  function toggleModule(mod) {
    setForm(f => {
      const current = f.allowed_modules ?? MODULES.map(m => m.value)
      const next = current.includes(mod)
        ? current.filter(m => m !== mod)
        : [...current, mod]
      // If all selected → null (means all)
      return { ...f, allowed_modules: next.length === MODULES.length ? null : next }
    })
  }

  const selectedMods = form.allowed_modules ?? MODULES.map(m => m.value)

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (!user) {
        // Create auth user via a SEPARATE supabase client
        // This prevents overwriting the current admin's session
        if (!form.password) throw new Error(isAr ? 'كلمة المرور مطلوبة' : 'Password is required')
        if (form.password.length < 6) throw new Error(isAr ? 'كلمة المرور 6 أحرف على الأقل' : 'Password must be at least 6 characters')

        const tempClient = createClient(
          import.meta.env.VITE_SUPABASE_URL,
          import.meta.env.VITE_SUPABASE_ANON_KEY,
          {
            auth: {
              persistSession:    false,
              autoRefreshToken:  false,
              detectSessionInUrl:false,
              storageKey:        'nwbus_temp_' + Date.now(), // منع مشاركة الجلسة مع الكلاينت الرئيسي
            }
          }
        )
        const email = `${form.username.toLowerCase()}@nwbus.sa`
        const { data: authData, error: authErr } = await tempClient.auth.signUp({ email, password: form.password })
        if (authErr) throw authErr
        const authId = authData?.user?.id
        if (!authId) throw new Error(isAr ? 'فشل إنشاء حساب المصادقة — تأكد من تعطيل Email Confirmation في Supabase' : 'Auth account creation failed — disable Email Confirmation in Supabase')

        // Step 1: insert core columns (always exist in DB)
        const { data: inserted, error: insertErr } = await supabase.from('users').insert({
          username:     form.username.toLowerCase(),
          full_name_ar: form.full_name_ar,
          full_name_en: form.full_name_en || null,
          role:         form.role,
          station_id:   primaryStation(),
          language:     form.language,
          is_active:    form.is_active,
          auth_id:      authId,
          created_by:   profile.id,
        }).select('id').single()
        if (insertErr) throw insertErr
        if (inserted?.id && form.role === 'station_admin') await syncStations(inserted.id)

        // Step 2: optional columns (migrations 003 + 006) — silent if not applied yet
        if (inserted?.id) {
          const extras = {}
          if (form.job_number.trim())        extras.job_number      = form.job_number.trim()
          if (form.supervisor_id)            extras.supervisor_id   = form.supervisor_id
          if (form.allowed_modules !== null) extras.allowed_modules = form.allowed_modules
          if (Object.keys(extras).length) {
            const { error: extrasErr } = await supabase.from('users').update(extras).eq('id', inserted.id)
            if (extrasErr && !extrasErr.message?.includes('column') && !extrasErr.message?.includes('does not exist')) throw extrasErr
          }
          // الأعمدة الجديدة — نُظهر الخطأ إن وُجد (لا نُخفيه)
          const { error: nErr } = await supabase.from('users').update({
            phone: form.phone.trim() || null,
            job_title: form.job_title || null,
            ...(isGeneralAdmin ? { is_accountant: !!form.is_accountant } : {}),
          }).eq('id', inserted.id)
          if (nErr) throw nErr
        }

      } else {
        // Update core columns
        const { error: updErr } = await supabase.from('users').update({
          full_name_ar: form.full_name_ar,
          full_name_en: form.full_name_en || null,
          role:         form.role,
          station_id:   primaryStation(),
          language:     form.language,
          is_active:    form.is_active,
        }).eq('id', user.id)
        if (updErr) throw updErr
        if (form.role === 'station_admin') await syncStations(user.id)

        // Optional columns — silent if not applied yet (migration may not be deployed)
        const extras = { supervisor_id: form.supervisor_id || null, allowed_modules: form.allowed_modules }
        extras.job_number = form.job_number.trim() || null
        const { error: extrasErr } = await supabase.from('users').update(extras).eq('id', user.id)
        if (extrasErr && !extrasErr.message?.includes('column') && !extrasErr.message?.includes('does not exist')) throw extrasErr
        // الأعمدة الجديدة — نُظهر الخطأ إن وُجد
        const { error: nErr } = await supabase.from('users').update({
          phone: form.phone.trim() || null,
          job_title: form.job_title || null,
          ...(isGeneralAdmin ? { is_accountant: !!form.is_accountant } : {}),
        }).eq('id', user.id)
        if (nErr) throw nErr
      }

      onSaved()
      onClose()
    } catch (err) {
      const msg = err.message ?? ''
      if (msg.includes('users_username_key') || (msg.includes('duplicate key') && msg.includes('username'))) {
        setError(isAr ? 'اسم المستخدم مستخدم بالفعل — اختر اسماً آخر' : 'Username already exists — choose a different one')
      } else if (msg.includes('duplicate key')) {
        setError(isAr ? 'البيانات مكررة — تحقق من المدخلات' : 'Duplicate entry — check your inputs')
      } else if (msg.includes('User already registered') || msg.includes('already been registered')) {
        setError(isAr ? 'هذا الحساب موجود مسبقاً في نظام المصادقة' : 'This account already exists in the auth system')
      } else {
        setError(msg)
      }
    }
    setSaving(false)
  }

  const inputCls = "w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none"

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg,#0F2444,#1B3A6B)' }}>
          <h2 className="font-bold text-white text-base">
            👤 {user ? (isAr ? 'تعديل موظف' : 'Edit Staff') : (isAr ? 'موظف جديد' : 'New Staff')}
          </h2>
          <button onClick={onClose} className="text-white/50 hover:text-white text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSave} className="px-6 py-5 space-y-4">

          {/* رقم الوظيفي */}
          <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
            <label className="block text-xs font-bold text-amber-800 mb-1.5">
              🪪 {isAr ? 'الرقم الوظيفي' : 'Employee Number'}
            </label>
            <input
              type="number"
              inputMode="numeric"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none bg-white font-mono"
              value={form.job_number}
              onChange={e => set('job_number', e.target.value.replace(/\D/g, ''))}
              placeholder={isAr ? 'مثال: 1030986' : 'e.g. 1030986'}
            />
          </div>

          {/* Username + Password — new user only */}
          {!user && (
            <div className="bg-blue-50 rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                {isAr ? 'بيانات الدخول' : 'Login Credentials'}
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'اسم المستخدم *' : 'Username *'}</label>
                <input required className={inputCls} value={form.username}
                  onChange={e => set('username', e.target.value.toLowerCase().replace(/\s/g, ''))}
                  placeholder={isAr ? 'بدون مسافات' : 'No spaces'} />
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{form.username}@nwbus.sa</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'كلمة المرور *' : 'Password *'}</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    required minLength={6}
                    className={inputCls + ' pe-10'}
                    value={form.password}
                    onChange={e => set('password', e.target.value)}
                    placeholder={isAr ? '٦ أحرف على الأقل' : 'At least 6 characters'}
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute inset-y-0 end-0 px-3 flex items-center text-gray-400 hover:text-gray-700">
                    {showPass ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* بيانات الدخول — للأدمن فقط عند التعديل */}
          {user && isGeneralAdmin && (
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                🔐 {isAr ? 'بيانات الدخول' : 'Login Info'}
              </p>
              <p className="text-xs text-gray-500 mb-1">{isAr ? 'اسم المستخدم' : 'Username'}</p>
              <p className="font-mono text-sm text-nwbus-primary font-bold">{user.username}@nwbus.sa</p>
            </div>
          )}

          {/* Names */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'الاسم (عربي) *' : 'Name (Arabic) *'}</label>
              <input required className={inputCls} value={form.full_name_ar}
                onChange={e => set('full_name_ar', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'الاسم (إنجليزي)' : 'Name (English)'}</label>
              <input className={inputCls} value={form.full_name_en}
                onChange={e => set('full_name_en', e.target.value)} />
            </div>
          </div>

          {/* Phone + Job title */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">📱 {isAr ? 'رقم الجوال' : 'Mobile'}</label>
              <input className={inputCls} value={form.phone} inputMode="numeric" dir="ltr"
                onChange={e => set('phone', toLatinDigits(e.target.value))}
                placeholder="05xxxxxxxx" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">💼 {isAr ? 'المسمى الوظيفي' : 'Job Title'}</label>
              <select className={inputCls} value={form.job_title} onChange={e => set('job_title', e.target.value)}>
                <option value="">{isAr ? '— اختر —' : '— Select —'}</option>
                {JOB_TITLES.map(j => <option key={j.value} value={j.value}>{isAr ? j.ar : j.en}</option>)}
              </select>
            </div>
          </div>

          {/* Role + Language */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'الصلاحية *' : 'Role *'}</label>
              <select required className={inputCls} value={form.role} onChange={e => set('role', e.target.value)}>
                {allowedRoles.map(r => (
                  <option key={r.value} value={r.value}>{isAr ? r.ar : r.en}</option>
                ))}
              </select>
              {isGeneralAdmin && form.role !== 'accountant' && form.role !== 'general_admin' && (
                <label className="flex items-center gap-2 mt-2 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" className="rounded accent-nwbus-primary"
                    checked={form.is_accountant} onChange={e => set('is_accountant', e.target.checked)} />
                  {isAr ? '➕ صلاحيات محاسب أيضاً (بنفس الوقت)' : '➕ Also grant accountant access'}
                </label>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'اللغة' : 'Language'}</label>
              <select className={inputCls} value={form.language} onChange={e => set('language', e.target.value)}>
                <option value="ar">عربي</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          {/* Station — single (لغير المشرف) */}
          {!(isGeneralAdmin && form.role === 'station_admin') && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'المحطة' : 'Station'}</label>
              <select className={inputCls} value={form.station_id} onChange={e => set('station_id', e.target.value)}
                disabled={isStationAdmin}>
                <option value="">{isAr ? '— بدون محطة —' : '— No Station —'}</option>
                {stations.map(s => (
                  <option key={s.id} value={s.id}>{isAr ? s.name_ar : s.name_en}</option>
                ))}
              </select>
            </div>
          )}

          {/* Multi-station — for supervisor (station_admin), admin assigns */}
          {isGeneralAdmin && form.role === 'station_admin' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {isAr ? 'محطات المشرف (يمكن اختيار أكثر من محطة)' : 'Supervisor Stations (multiple allowed)'}
              </label>
              <div className="border rounded-lg p-2 max-h-40 overflow-y-auto grid grid-cols-2 gap-1">
                {stations.map(s => {
                  const on = stationSet.has(s.id)
                  return (
                    <button type="button" key={s.id} onClick={() => toggleStation(s.id)}
                      className={`flex items-center gap-2 text-right rounded px-2 py-1.5 text-sm transition
                        ${on ? 'bg-blue-50 text-nwbus-primary font-medium' : 'hover:bg-gray-50 text-gray-600'}`}>
                      <span className={`w-4 h-4 rounded grid place-items-center text-[10px] border shrink-0
                        ${on ? 'bg-nwbus-primary border-nwbus-primary text-white' : 'border-gray-300'}`}>
                        {on && '✓'}
                      </span>
                      <span className="truncate">{isAr ? s.name_ar : s.name_en}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-gray-400 mt-1">
                {isAr ? `المختارة: ${stationSet.size}` : `Selected: ${stationSet.size}`}
              </p>
            </div>
          )}

          {/* Supervisor — for employee/accountant */}
          {['station_employee', 'accountant'].includes(form.role) && supervisors.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {isAr ? 'المشرف المباشر' : 'Direct Supervisor'}
              </label>
              <select className={inputCls} value={form.supervisor_id} onChange={e => set('supervisor_id', e.target.value)}>
                <option value="">{isAr ? '— بدون مشرف —' : '— No Supervisor —'}</option>
                {supervisors.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name_ar}</option>
                ))}
              </select>
            </div>
          )}

          {/* Module Permissions */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">
                {isAr ? 'الأقسام المتاحة' : 'Allowed Sections'}
              </p>
              <button type="button" onClick={() => set('allowed_modules', null)}
                className="text-xs text-nwbus-primary underline">
                {isAr ? 'الكل' : 'All'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MODULES.map(m => (
                <label key={m.value} className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg hover:bg-white transition-colors">
                  <input type="checkbox" className="rounded accent-nwbus-primary"
                    checked={selectedMods.includes(m.value)}
                    onChange={() => toggleModule(m.value)} />
                  <span className="text-gray-700">{isAr ? m.ar : m.en}</span>
                </label>
              ))}
            </div>
            {form.allowed_modules === null && (
              <p className="text-xs text-green-600 mt-2">✓ {isAr ? 'صلاحية وصول كاملة لجميع الأقسام' : 'Full access to all sections'}</p>
            )}
          </div>

          {/* Active */}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="rounded accent-nwbus-primary"
              checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />
            <span className={form.is_active ? 'text-green-700 font-medium' : 'text-gray-400'}>
              {form.is_active ? (isAr ? '✓ حساب نشط' : '✓ Active Account') : (isAr ? 'حساب معطّل' : 'Disabled Account')}
            </span>
          </label>

          {error && (
            <div className="text-xs rounded-lg p-3 bg-red-50 text-red-600 border border-red-100">
              ⚠ {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 bg-nwbus-primary text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-nwbus-dark transition-colors">
              {saving ? (isAr ? 'جارٍ الحفظ...' : 'Saving...') : (isAr ? '💾 حفظ' : '💾 Save')}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── Main Page ────────────────────────────────────────── */
export default function UsersPage() {
  const { profile, isGeneralAdmin, isStationAdmin, isAccountant } = useAuth()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const [users,    setUsers]    = useState([])
  const [stations, setStations] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(null)
  const [search,   setSearch]   = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    let usersQuery = supabase
      .from('users')
      .select('*, station:station_id(name_ar, name_en)')
      .order('created_at', { ascending: false })

    // Station admin only sees users of their station
    if (isStationAdmin && !isGeneralAdmin) {
      usersQuery = usersQuery.eq('station_id', profile.station_id)
    }

    const [{ data: u }, { data: s }] = await Promise.all([
      usersQuery,
      supabase.from('stations').select('id, name_ar, name_en').eq('is_active', true).order('name_ar'),
    ])
    setUsers(u ?? [])
    setStations((s ?? []).filter(st => !isRestStation(st)))
    setLoading(false)
  }, [isGeneralAdmin, isStationAdmin, profile?.station_id])

  useEffect(() => { fetchAll() }, [fetchAll])

  // حذف الحساب — للأدمن، وللمشرف ضمن محطته فقط
  async function deleteUser(u) {
    const canDelete = isGeneralAdmin || (isStationAdmin && u.station_id === profile?.station_id && u.id !== profile?.id)
    if (!canDelete) return
    if (!confirm(isAr ? `حذف حساب «${u.full_name_ar}» نهائياً؟` : `Delete «${u.full_name_ar}» permanently?`)) return
    const { data, error } = await supabase.from('users').delete().eq('id', u.id).select('id')
    if (error) {
      // ارتباط بسجلات (مغادرة/إيرادات...) يمنع الحذف النهائي → نعطّل الحساب بدلاً منه
      const fk = /foreign key|violates|referenced/i.test(error.message)
      if (fk && confirm(isAr ? 'الحساب مرتبط بسجلات ولا يمكن حذفه نهائياً. هل تريد تعطيله بدلاً من ذلك؟' : 'Account has linked records. Deactivate instead?')) {
        const { error: e2 } = await supabase.from('users').update({ is_active: false }).eq('id', u.id)
        if (e2) { alert((isAr ? 'فشل التعطيل: ' : 'Failed: ') + e2.message); return }
        fetchAll(); return
      }
      alert((isAr ? 'فشل الحذف: ' : 'Delete failed: ') + error.message); return
    }
    if (!data || data.length === 0) {
      alert(isAr ? 'لم يُحذف الحساب — تأكد من تفعيل صلاحية الحذف (RLS) في قاعدة البيانات.' : 'Not deleted — check delete RLS policy.')
      return
    }
    fetchAll()
  }

  const supervisors = users.filter(u => u.role === 'station_admin')

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    const matchSearch = !search ||
      (u.full_name_ar ?? '').toLowerCase().includes(q) ||
      (u.username     ?? '').toLowerCase().includes(q) ||
      (u.full_name_en ?? '').toLowerCase().includes(q)
    const matchRole = !roleFilter || u.role === roleFilter
    return matchSearch && matchRole
  })

  return (
    <div className="p-4 md:p-6" dir={isAr ? 'rtl' : 'ltr'}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-nwbus-primary">👥 {isAr ? 'إدارة الموظفين' : 'Staff Management'}</h1>
          <p className="text-xs text-gray-400 mt-0.5">{isAr ? 'إدارة الموظفين وصلاحياتهم' : 'Manage staff and permissions'}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input placeholder={isAr ? 'بحث بالاسم أو المستخدم...' : 'Search name or username...'}
            value={search} onChange={e => setSearch(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none w-52" />
          <button onClick={() => setModal('new')}
            className="bg-nwbus-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-nwbus-dark transition-colors whitespace-nowrap">
            + {isAr ? 'جديد' : 'New'}
          </button>
        </div>
      </div>

      {/* Role filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[{ value: '', ar: 'الكل', en: 'All' }, ...USER_ROLES].map(r => (
          <button key={r.value} onClick={() => setRoleFilter(r.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border
              ${roleFilter === r.value
                ? 'bg-nwbus-primary text-white border-nwbus-primary'
                : 'bg-white text-gray-600 border-gray-200 hover:border-nwbus-primary/50'}`}>
            {isAr ? r.ar : r.en}
            {r.value && (
              <span className="ms-1.5 opacity-60">
                ({users.filter(u => u.role === r.value).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {USER_ROLES.map(r => (
          <div key={r.value} className={`rounded-xl p-3 border ${ROLE_COLORS[r.value]}`}>
            <div className="text-2xl font-extrabold">{users.filter(u => u.role === r.value).length}</div>
            <div className="text-xs mt-0.5 font-medium">{isAr ? r.ar : r.en}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">⏳</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-2">👥</p>
          <p>{isAr ? 'لا يوجد أعضاء' : 'No members found'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-nwbus-primary text-white text-xs">
              <tr>
                {[
                  isAr ? 'الرقم الوظيفي' : 'Emp. No.',
                  isAr ? 'الموظف' : 'Employee',
                  isAr ? 'المسمى الوظيفي' : 'Job Title',
                  isAr ? 'الصلاحية' : 'Role',
                  isAr ? 'المحطة' : 'Station',
                  isAr ? 'الأقسام' : 'Modules',
                  isAr ? 'الحالة' : 'Status',
                  '',
                ].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-right font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 transition-colors ${!u.is_active ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-nwbus-primary">
                    {u.job_number || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-800">{u.full_name_ar}
                      {u.is_accountant && <span className="ms-1 text-[10px] bg-yellow-100 text-yellow-700 rounded px-1.5 py-0.5">+ محاسب</span>}
                    </p>
                    {(isGeneralAdmin || isAccountant) && u.phone && (
                      <p className="text-xs text-gray-500 font-mono" dir="ltr">📱 {u.phone}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {u.job_title ? (JOB_TITLES.find(j => j.value === u.job_title)?.[isAr ? 'ar' : 'en'] ?? u.job_title) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs rounded-full px-2.5 py-0.5 border font-semibold ${ROLE_COLORS[u.role]}`}>
                      {USER_ROLES.find(r => r.value === u.role)?.[isAr ? 'ar' : 'en']}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {u.station ? (isAr ? u.station.name_ar : u.station.name_en) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {u.allowed_modules === null ? (
                      <span className="text-xs text-green-600 font-medium">جميع الأقسام</span>
                    ) : (
                      <span className="text-xs text-gray-400">{u.allowed_modules?.length ?? 0} قسم</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs rounded-full px-2 py-0.5 ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                      {u.is_active ? (isAr ? 'نشط' : 'Active') : (isAr ? 'معطّل' : 'Inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => setModal(u)}
                        className="text-xs border border-nwbus-primary text-nwbus-primary rounded-lg px-3 py-1 hover:bg-nwbus-primary hover:text-white transition-colors">
                        {isAr ? 'تعديل' : 'Edit'}
                      </button>
                      {(isGeneralAdmin || (isStationAdmin && u.station_id === profile?.station_id && u.id !== profile?.id)) && (
                        <button onClick={() => deleteUser(u)}
                          className="text-xs border border-red-300 text-red-500 rounded-lg px-2.5 py-1 hover:bg-red-500 hover:text-white transition-colors">
                          {isAr ? 'حذف' : 'Delete'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <UserModal
          user={modal === 'new' ? null : modal}
          stations={stations}
          supervisors={supervisors}
          onClose={() => setModal(null)}
          onSaved={fetchAll}
        />
      )}
    </div>
  )
}
