/**
 * AuditStamp — shown on every entry/card automatically.
 * Displays: who entered it, when, and last update if any.
 */
import { useTranslation } from 'react-i18next'

export default function AuditStamp({ record }) {
  const { i18n, t } = useTranslation()
  const isAr = i18n.language === 'ar'

  if (!record) return null

  const fmtDate = (iso) => iso
    ? new Date(iso).toLocaleString(isAr ? 'ar-SA-u-ca-gregory' : 'en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
      })
    : '—'

  return (
    <div className="audit-stamp border-t border-gray-100 pt-1 mt-2 space-y-0.5">
      <span>
        <strong>{t('created_by')}:</strong>{' '}
        {record.created_by_name || '—'}
        {' · '}
        {fmtDate(record.created_at)}
      </span>
      {record.updated_at && (
        <span className="block">
          <strong>{t('updated_by')}:</strong>{' '}
          {record.updated_by_name || '—'}
          {' · '}
          {fmtDate(record.updated_at)}
        </span>
      )}
    </div>
  )
}
