import { useState, useRef, useEffect } from 'react'

/**
 * قائمة اختيار مع بحث.
 * props: value, onChange(value), options [{value,label}], placeholder, className, isAr
 */
export default function SearchSelect({ value, onChange, options = [], placeholder = '', className = '', isAr = true }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  const selRef = useRef(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    if (!open) return
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQ('') } }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // عند الفتح: اقفز للمحطة المختارة بدل بداية القائمة
  useEffect(() => {
    if (open && selRef.current) selRef.current.scrollIntoView({ block: 'center' })
  }, [open])

  const matches = q.trim()
    ? options.filter(o => o.label.toLowerCase().includes(q.trim().toLowerCase()))
    : options

  return (
    <div className="relative" ref={ref} dir={isAr ? 'rtl' : 'ltr'}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`${className} flex items-center justify-between gap-2 ${!selected ? 'text-gray-400' : ''}`}>
        <span className="truncate">{selected ? selected.label : (placeholder || (isAr ? '— اختر —' : '— Select —'))}</span>
        <span className="text-gray-400 text-xs shrink-0">▼</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[220px] bg-white rounded-lg shadow-2xl border border-gray-100 p-2">
          <input autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder={isAr ? '🔍 بحث...' : '🔍 Search...'}
            className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none mb-2" />
          <div className="max-h-56 overflow-y-auto">
            {matches.length === 0
              ? <p className="text-xs text-gray-400 text-center py-3">{isAr ? 'لا نتائج' : 'No results'}</p>
              : matches.map(o => (
                <button key={o.value || '_'} type="button"
                  ref={o.value === value ? selRef : null}
                  onClick={() => { onChange(o.value); setOpen(false); setQ('') }}
                  className={`w-full text-${isAr ? 'right' : 'left'} px-2 py-1.5 rounded-md text-sm hover:bg-blue-50 ${o.value === value ? 'bg-blue-50 text-nwbus-primary font-semibold' : 'text-gray-700'}`}>
                  {o.label}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
