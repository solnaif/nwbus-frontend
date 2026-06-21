import { useState, useRef, useEffect } from 'react'

/**
 * تقويم ميلادي عربي ثابت — بديل موحّد عن <input type="date"> في كل الصفحات.
 *
 * Props:
 *   value     : 'YYYY-MM-DD' أو '' (سلسلة نصية)
 *   onChange  : (value: string) => void   — تُستدعى بالقيمة مباشرة
 *   className : تنسيق حقل الإدخال (نفس class الحقول الأخرى)
 *   isAr      : عربي/إنجليزي (افتراضي true)
 *   placeholder
 */

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// ترتيب الأيام من السبت (RTL يضع السبت على اليمين)
const DOW_AR = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج']
const DOW_EN = ['Sa', 'Su', 'Mo', 'Tu', 'We', 'Th', 'Fr']

function pad(n) { return n < 10 ? '0' + n : '' + n }
function toStr(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}` }
function parse(v) {
  if (!v) return null
  const [y, m, d] = v.split('-').map(Number)
  if (!y || !m || !d) return null
  return { y, m: m - 1, d }
}

export default function DatePicker({ value, onChange, className = '', isAr = true, placeholder, inline = false }) {
  const [open, setOpen] = useState(false)
  const [yearPick, setYearPick] = useState(false)
  const today = new Date()
  const sel = parse(value)
  const [view, setView] = useState(() => sel
    ? { y: sel.y, m: sel.m }
    : { y: today.getFullYear(), m: today.getMonth() })
  const ref = useRef(null)

  // مزامنة العرض عند تغيّر القيمة من الخارج
  useEffect(() => {
    const s = parse(value)
    if (s) setView({ y: s.y, m: s.m })
  }, [value])

  // إغلاق عند الضغط خارج التقويم
  useEffect(() => {
    if (!open) return
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setYearPick(false) } }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const months = isAr ? MONTHS_AR : MONTHS_EN
  const dow = isAr ? DOW_AR : DOW_EN

  const display = sel
    ? `${sel.d} ${months[sel.m]} ${sel.y}`
    : (placeholder ?? (isAr ? 'اختر التاريخ' : 'Select date'))

  function stepMonth(delta) {
    setView(v => {
      let m = v.m + delta, y = v.y
      if (m < 0) { m = 11; y-- }
      if (m > 11) { m = 0; y++ }
      return { y, m }
    })
  }

  function pick(y, m, d) {
    onChange(toStr(y, m, d))
    setOpen(false)
    setYearPick(false)
  }

  // بناء شبكة الأيام (تبدأ السبت)
  const firstDow = new Date(view.y, view.m, 1).getDay()      // 0=الأحد .. 6=السبت
  const offset = (firstDow + 1) % 7                            // عدد خانات الشهر السابق
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const prevDays = new Date(view.y, view.m, 0).getDate()

  const cells = []
  for (let i = 0; i < offset; i++) cells.push({ d: prevDays - offset + 1 + i, out: true })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d, out: false })
  while (cells.length % 7 !== 0 || cells.length < 42) {
    cells.push({ d: cells.length - (offset + daysInMonth) + 1, out: true })
    if (cells.length >= 42) break
  }

  const isToday = (d) => view.y === today.getFullYear() && view.m === today.getMonth() && d === today.getDate()
  const isSel = (d) => sel && sel.y === view.y && sel.m === view.m && sel.d === d

  const years = []
  for (let y = today.getFullYear() - 10; y <= today.getFullYear() + 5; y++) years.push(y)

  const cellCls = inline ? 'py-0.5 text-[11px]' : 'py-1 text-xs'
  const panel = (
        <div className={inline
          ? 'w-52 bg-white rounded-lg border border-gray-200 p-2 select-none'
          : 'absolute z-50 mt-1 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 p-2.5 select-none'}>
          {/* الرأس */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => stepMonth(-1)}
                className="w-8 h-8 grid place-items-center rounded-lg hover:bg-gray-100 text-gray-600" aria-label="prev">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" /></svg>
              </button>
              <button type="button" onClick={() => stepMonth(1)}
                className="w-8 h-8 grid place-items-center rounded-lg hover:bg-gray-100 text-gray-600" aria-label="next">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>
            <button type="button" onClick={() => setYearPick(p => !p)}
              className="flex items-center gap-1 font-bold text-gray-800 hover:text-nwbus-primary px-2 py-1 rounded-lg hover:bg-gray-50">
              <span>{months[view.m]} {view.y}</span>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M5 7l5 5 5-5z" /></svg>
            </button>
          </div>

          {yearPick ? (
            <div className="grid grid-cols-4 gap-1 max-h-48 overflow-y-auto py-1">
              {years.map(y => (
                <button key={y} type="button" onClick={() => { setView(v => ({ ...v, y })); setYearPick(false) }}
                  className={`py-2 rounded-lg text-sm ${y === view.y ? 'bg-nwbus-primary text-white font-bold' : 'hover:bg-gray-100 text-gray-700'}`}>
                  {y}
                </button>
              ))}
            </div>
          ) : (
            <>
              {/* أيام الأسبوع */}
              <div className="grid grid-cols-7 mb-0.5">
                {dow.map((d, i) => (
                  <div key={i} className="text-center text-[11px] font-semibold text-gray-400 py-0.5">{d}</div>
                ))}
              </div>
              {/* الأيام */}
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((c, i) => {
                  if (c.out) return <div key={i} className={`text-center ${cellCls} text-gray-300`}>{c.d}</div>
                  const seld = isSel(c.d), tod = isToday(c.d)
                  return (
                    <button key={i} type="button" onClick={() => pick(view.y, view.m, c.d)}
                      className={`text-center ${cellCls} rounded-lg transition
                        ${seld ? 'bg-nwbus-primary text-white font-bold shadow'
                          : tod ? 'border border-nwbus-primary text-nwbus-primary font-semibold'
                          : 'hover:bg-gray-100 text-gray-700'}`}>
                      {c.d}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* التذييل */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => { onChange(''); setOpen(false); setYearPick(false) }}
              className="text-sm text-gray-400 hover:text-red-500 font-medium px-2 py-1">
              {isAr ? 'محو' : 'Clear'}
            </button>
            <button type="button" onClick={() => pick(today.getFullYear(), today.getMonth(), today.getDate())}
              className="text-sm text-nwbus-primary hover:underline font-semibold px-2 py-1">
              {isAr ? 'اليوم' : 'Today'}
            </button>
          </div>
        </div>
  )

  // وضع التقويم الكامل الظاهر دائماً
  if (inline) {
    return <div dir={isAr ? 'rtl' : 'ltr'}>{panel}</div>
  }

  return (
    <div className="relative inline-block w-full" ref={ref} dir={isAr ? 'rtl' : 'ltr'}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`${className} text-${isAr ? 'right' : 'left'} flex items-center justify-between gap-2 ${!sel ? 'text-gray-400' : 'text-gray-800'}`}>
        <span>{display}</span>
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>
      {open && panel}
    </div>
  )
}
