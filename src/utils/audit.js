/**
 * Audit helpers — auto-attach created_by / updated_by to every write.
 * Usage:
 *   await supabase.from('trip_records').insert(withAudit(data, profile))
 *   await supabase.from('trip_records').update(withUpdateAudit(data, profile)).eq('id', id)
 */

export function withAudit(data, profile) {
  return {
    ...data,
    created_by:      profile.id,
    created_by_name: profile.full_name_ar,
  }
}

export function withUpdateAudit(data, profile) {
  return {
    ...data,
    updated_by:      profile.id,
    updated_by_name: profile.full_name_ar,
    updated_at:      new Date().toISOString(),
  }
}

/**
 * Format an audit stamp for display in the UI.
 * Shows: "أُدخل بواسطة [Name] — DD/MM/YYYY HH:MM"
 */
export function formatAuditStamp(record, lang = 'ar') {
  const name = record.created_by_name || '—'
  const dt   = record.created_at
    ? new Date(record.created_at).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-GB')
    : '—'

  if (lang === 'ar') return `أُدخل بواسطة: ${name} — ${dt}`
  return `Entered by: ${name} — ${dt}`
}

export function formatUpdateStamp(record, lang = 'ar') {
  if (!record.updated_at) return null
  const name = record.updated_by_name || '—'
  const dt   = new Date(record.updated_at).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-GB')
  if (lang === 'ar') return `عُدِّل بواسطة: ${name} — ${dt}`
  return `Updated by: ${name} — ${dt}`
}
