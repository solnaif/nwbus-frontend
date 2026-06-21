import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { ITEM_TYPES } from '../utils/constants'
import DatePicker from '../components/shared/DatePicker'
import { todayStr } from '../utils/dates'

const STATUS_LABELS = {
  ar: { unclaimed: 'غير مستلمة', claimed: 'مستلمة', disposed: 'تم التخلص منها' },
  en: { unclaimed: 'Unclaimed', claimed: 'Claimed', disposed: 'Disposed' },
}
const STATUS_COLORS = {
  unclaimed: 'bg-yellow-100 text-yellow-800',
  claimed:   'bg-green-100 text-green-800',
  disposed:  'bg-gray-100 text-gray-600',
}

/* ─── Item Form Modal ──────────────────────────────────── */
function ItemModal({ item, onClose, onSaved }) {
  const { profile } = useAuth()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const [form, setForm] = useState({
    item_description: item?.item_description ?? '',
    item_type:        item?.item_type ?? 'other',
    found_date:       item?.found_date ?? todayStr(),
    found_location:   item?.found_location ?? '',
    trip_number:      item?.trip_number ?? '',
    bus_number:       item?.bus_number ?? '',
    status:           item?.status ?? 'unclaimed',
    owner_name:       item?.owner_name ?? '',
    owner_contact:    item?.owner_contact ?? '',
    resolved_date:    item?.resolved_date ?? '',
    notes:            item?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      ...form,
      station_id:       profile.station_id,
      resolved_date:    form.resolved_date || null,
      trip_number:      form.trip_number || null,
      bus_number:       form.bus_number || null,
      owner_name:       form.owner_name || null,
      owner_contact:    form.owner_contact || null,
      found_location:   form.found_location || null,
      notes:            form.notes || null,
      created_by:       profile.id,
      created_by_name:  profile.full_name_ar,
      created_by_phone: profile.phone || null,
    }

    let res
    if (item) {
      res = await supabase.from('lost_found_items').update({
        ...payload,
        updated_by:      profile.id,
        updated_by_name: profile.full_name_ar,
        updated_at:      new Date().toISOString(),
      }).eq('id', item.id)
    } else {
      res = await supabase.from('lost_found_items').insert(payload)
    }

    if (res.error) { setError(res.error.message) }
    else { onSaved(); onClose() }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="font-bold text-nwbus-primary text-lg">
            🧳 {item ? (isAr ? 'تعديل غرض' : 'Edit Item') : (isAr ? 'إضافة غرض مفقود' : 'Add Lost Item')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSave} className="px-6 py-4 space-y-4">
          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {isAr ? 'وصف الغرض *' : 'Item Description *'}
            </label>
            <textarea rows={2} required
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none resize-none"
              value={form.item_description}
              onChange={e => set('item_description', e.target.value)}
            />
          </div>

          {/* Type + Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {isAr ? 'نوع الغرض' : 'Item Type'}
              </label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none"
                value={form.item_type} onChange={e => set('item_type', e.target.value)}>
                {ITEM_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{isAr ? t.ar : t.en}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {isAr ? 'تاريخ الإيجاد' : 'Found Date'}
              </label>
              <DatePicker inline isAr={isAr}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none"
                value={form.found_date} onChange={v => set('found_date', v)}
              />
            </div>
          </div>

          {/* Location + trip */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {isAr ? 'مكان الإيجاد' : 'Found Location'}
              </label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none"
                value={form.found_location} onChange={e => set('found_location', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {isAr ? 'رقم الرحلة' : 'Trip #'}
              </label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none"
                value={form.trip_number} onChange={e => set('trip_number', e.target.value)}
              />
            </div>
          </div>

          {/* Bus number */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {isAr ? 'رقم الحافلة' : 'Bus Number'}
            </label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none"
              value={form.bus_number} onChange={e => set('bus_number', e.target.value)}
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {isAr ? 'الحالة' : 'Status'}
            </label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none"
              value={form.status} onChange={e => set('status', e.target.value)}>
              {['unclaimed', 'claimed', 'disposed'].map(s => (
                <option key={s} value={s}>{STATUS_LABELS[isAr ? 'ar' : 'en'][s]}</option>
              ))}
            </select>
          </div>

          {/* Owner info — shown when claimed */}
          {form.status === 'claimed' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {isAr ? 'اسم المستلم' : 'Owner Name'}
                  </label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none"
                    value={form.owner_name} onChange={e => set('owner_name', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {isAr ? 'رقم التواصل' : 'Contact'}
                  </label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none"
                    value={form.owner_contact} onChange={e => set('owner_contact', e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {isAr ? 'تاريخ الاستلام' : 'Resolved Date'}
                </label>
                <DatePicker inline isAr={isAr}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none"
                  value={form.resolved_date} onChange={v => set('resolved_date', v)}
                />
              </div>
            </>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {isAr ? 'ملاحظات' : 'Notes'}
            </label>
            <textarea rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none resize-none"
              value={form.notes} onChange={e => set('notes', e.target.value)}
            />
          </div>

          {error && <p className="text-red-600 text-xs bg-red-50 rounded p-2">{error}</p>}

          {/* Audit stamp */}
          <p className="text-xs text-gray-400 border-t pt-2">
            ✍️ {profile?.full_name_ar}{profile?.phone ? ` · 📱 ${profile.phone}` : ''} · {new Date().toLocaleDateString('ar-SA-u-ca-gregory')}
          </p>

          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="flex-1 bg-nwbus-primary text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-nwbus-dark transition-colors">
              {saving ? '...' : (isAr ? 'حفظ' : 'Save')}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── Main Page ────────────────────────────────────────── */
export default function LostFoundPage() {
  const { profile, isGeneralAdmin, isAccountant } = useAuth()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(null)  // null | item | 'new'
  const [filter, setFilter]     = useState('all') // all | unclaimed | claimed | disposed
  const [search, setSearch]     = useState('')

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('lost_found_items')
      .select('*, station:station_id(name_ar, name_en)')
      .order('created_at', { ascending: false })
    setItems(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  const filtered = items.filter(it => {
    if (filter !== 'all' && it.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        it.item_description?.toLowerCase().includes(q) ||
        it.trip_number?.toLowerCase().includes(q) ||
        it.bus_number?.toLowerCase().includes(q) ||
        it.owner_name?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const counts = {
    all:       items.length,
    unclaimed: items.filter(i => i.status === 'unclaimed').length,
    claimed:   items.filter(i => i.status === 'claimed').length,
    disposed:  items.filter(i => i.status === 'disposed').length,
  }

  return (
    <div className="p-4 md:p-6" dir={isAr ? 'rtl' : 'ltr'}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h1 className="text-xl font-bold text-nwbus-primary">🧳 {isAr ? 'الموجودات' : 'Lost & Found'}</h1>
        <button onClick={() => setModal('new')}
          className="bg-nwbus-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-nwbus-dark transition-colors">
          + {isAr ? 'إضافة غرض' : 'Add Item'}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { key: 'all',       label: isAr ? 'الكل' : 'All' },
          { key: 'unclaimed', label: isAr ? 'غير مستلمة' : 'Unclaimed' },
          { key: 'claimed',   label: isAr ? 'مستلمة' : 'Claimed' },
          { key: 'disposed',  label: isAr ? 'تم التخلص' : 'Disposed' },
        ].map(f => (
          <button key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f.key
                ? 'bg-nwbus-primary text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label} ({counts[f.key]})
          </button>
        ))}

        {/* Search */}
        <input
          type="text"
          placeholder={isAr ? 'بحث...' : 'Search...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="ms-auto border rounded-full px-4 py-1.5 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none"
        />
      </div>

      {/* Items grid */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">⏳ {isAr ? 'جارٍ التحميل...' : 'Loading...'}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-2">🧳</p>
          <p>{isAr ? 'لا توجد عناصر' : 'No items found'}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(it => {
            const typeLabel = ITEM_TYPES.find(t => t.value === it.item_type)
            return (
              <div key={it.id}
                onClick={() => setModal(it)}
                className="bg-white rounded-xl shadow-sm border hover:shadow-md hover:border-nwbus-primary transition-all cursor-pointer p-4"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_COLORS[it.status]}`}>
                    {STATUS_LABELS[isAr ? 'ar' : 'en'][it.status]}
                  </span>
                  <span className="text-xs text-gray-400">
                    {typeLabel ? (isAr ? typeLabel.ar : typeLabel.en) : it.item_type}
                  </span>
                </div>

                <p className="text-sm font-medium text-gray-800 mb-2 line-clamp-2">
                  {it.item_description}
                </p>

                <div className="text-xs text-gray-400 space-y-0.5">
                  {it.trip_number && <p>🚌 {it.trip_number}</p>}
                  {it.found_location && <p>📍 {it.found_location}</p>}
                  {it.owner_name && (
                    <p className="text-green-600 font-medium">
                      ✅ {isAr ? 'استلمه:' : 'Claimed by:'} {it.owner_name}
                    </p>
                  )}
                  <p className="pt-1">✍️ {it.created_by_name}{(isGeneralAdmin || isAccountant) && it.created_by_phone ? ` · 📱 ${it.created_by_phone}` : ''} · {new Date(it.created_at).toLocaleDateString('ar-SA-u-ca-gregory')}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <ItemModal
          item={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={fetchItems}
        />
      )}
    </div>
  )
}
