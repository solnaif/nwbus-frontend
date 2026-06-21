import { useState, useEffect } from 'react'
import { toLatinDigits } from '../../utils/digits'

/**
 * مدخل وقت 24 ساعة سريع: اكتب الأرقام فقط (مثل 1505) وتنسّق تلقائياً 15:05.
 * value/onChange بصيغة "HH:MM".
 */
export default function TimeInput24({ value = '', onChange, className = '', placeholder = '--:--' }) {
  const [text, setText] = useState(value)
  useEffect(() => { setText(value) }, [value])

  function handle(e) {
    const d = toLatinDigits(e.target.value).replace(/\D/g, '').slice(0, 4)   // عربي→لاتيني ثم أرقام فقط
    const out = d.length <= 2 ? d : d.slice(0, 2) + ':' + d.slice(2)
    setText(out)
    if (d.length === 4) {
      const hh = Math.min(23, parseInt(d.slice(0, 2), 10))
      const mm = Math.min(59, parseInt(d.slice(2), 10))
      onChange(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`)
    } else if (d.length === 0) {
      onChange('')
    }
  }
  function blur() {
    const d = text.replace(/\D/g, '')
    if (!d) { onChange(''); return }
    const hh = Math.min(23, parseInt(d.slice(0, 2) || '0', 10))
    const mm = Math.min(59, parseInt(d.slice(2, 4) || '0', 10))
    const v = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
    setText(v); onChange(v)
  }

  return (
    <input value={text} onChange={handle} onBlur={blur}
      inputMode="numeric" maxLength={5} placeholder={placeholder} dir="ltr"
      className={`border rounded-xl px-3 py-2.5 text-sm text-center font-mono tracking-wider focus:ring-2 focus:ring-nwbus-primary focus:outline-none ${className}`} />
  )
}
