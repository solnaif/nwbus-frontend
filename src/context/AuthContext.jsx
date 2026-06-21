import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session,      setSession]      = useState(null)
  const [profile,      setProfile]      = useState(null)   // users table row
  const [loading,      setLoading]      = useState(true)
  const [profileError, setProfileError] = useState(null)  // debug error message

  // Fetch the full user profile from the users table
  async function fetchProfile(authUser) {
    if (!authUser) { setProfile(null); setLoading(false); return }
    setLoading(true)
    setProfileError(null)
    const { data, error } = await supabase
      .from('users')
      .select('*, station:station_id(id, name_ar, name_en, type)')
      .eq('auth_id', authUser.id)
      .maybeSingle()
    if (data) {
      setProfile(data)
      setProfileError(null)
      // Update last_login (non-blocking)
      supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.id)
    } else {
      const msg = error?.message || 'No profile row found for auth_id: ' + authUser.id
      console.error('fetchProfile failed:', msg, error)
      setProfile(null)
      setProfileError(msg)
    }
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      fetchProfile(session?.user)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) {
        fetchProfile(session.user)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function signIn(username, password) {
    setLoading(true)
    const email = `${username.toLowerCase()}@nwbus.sa`
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setLoading(false); throw error }
    // Immediately fetch profile so RequireAuth sees it
    if (data?.user) await fetchProfile(data.user)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
    setLoading(false)
  }

  // Permission helpers
  const isGeneralAdmin  = profile?.role === 'general_admin'
  const isStationAdmin  = profile?.role === 'station_admin'
  const isAccountant    = profile?.role === 'accountant' || profile?.is_accountant === true
  const isEmployee      = profile?.role === 'station_employee'
  const canManageUsers  = isGeneralAdmin
  const canViewAllStations = isGeneralAdmin   // الأدمن فقط يرى كل المحطات؛ المحاسب محصور بمحطته

  return (
    <AuthContext.Provider value={{
      session,
      profile,
      loading,
      profileError,
      signIn,
      signOut,
      isGeneralAdmin,
      isStationAdmin,
      isAccountant,
      isEmployee,
      canManageUsers,
      canViewAllStations,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
