import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { toLatinDigits, cleanNumber } from '../utils/digits'
import DatePicker from '../components/shared/DatePicker'
import { todayStr } from '../utils/dates'
import { isRestStation } from '../utils/stations'

const SHIFTS = [
  { value: 'A', ar: 'الوردية أ', en: 'Shift A' },
  { value: 'B', ar: 'الوردية ب', en: 'Shift B' },
  { value: 'C', ar: 'الوردية ج', en: 'Shift C' },
]

const fmt  = n => Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtD = d => d ? new Date(d).toLocaleDateString('ar-SA-u-ca-gregory', { year:'numeric', month:'short', day:'numeric' }) : '—'
const fmtT = d => d ? new Date(d).toLocaleTimeString('ar-SA-u-ca-gregory', { hour:'2-digit', minute:'2-digit', hour12: false }) : ''

const CASHIER_KEY  = 'nwbus_cashier_ref'
const EMPLOYEE_KEY = 'nwbus_employee_name'

const parseRefs = raw => {
  if (!raw) return ''
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr.join(' / ') : raw } catch { return raw }
}

/* ─── Sales Modal ───────────────────────────────────────── */
function SalesModal({ sale, stations, onClose, onSaved }) {
  const { profile, isAccountant, isGeneralAdmin } = useAuth()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const [savedCashier]  = useState(() => localStorage.getItem(CASHIER_KEY)  ?? '')
  const [savedEmployee] = useState(() => localStorage.getItem(EMPLOYEE_KEY) ?? '')

  // السجل مقفول إذا كان مؤكداً وليس الأدمن
  const isLocked = sale?.is_confirmed && !isGeneralAdmin

  function handlePrint() {
    const dir = isAr ? 'rtl' : 'ltr'
    const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="90" viewBox="0 0 398 198" fill="none"><path d="M217.45 73.4831L230.225 100.856H204.675L217.45 73.4831Z" fill="#1D1D1C"></path><path d="M123.432 32.9644L108.667 8.56036H135.605L123.432 32.9644Z" fill="#264673"></path><path d="M310.21 108.097C304.406 108.021 299.419 103.036 299.37 97.2583C299.318 91.2463 304.441 86.165 310.49 86.233C316.379 86.297 321.182 91.133 321.237 97.0583C321.294 103.156 316.279 108.177 310.21 108.097ZM389.265 46.289C388.59 40.337 387.926 34.385 387.263 28.433C387.01 26.1396 385.57 25.0636 383.443 24.6943C378.678 23.865 375.034 22.0183 372.829 17.069C370.747 12.4023 365.938 10.453 361.077 9.3063C357.753 8.5223 354.357 8.39297 350.941 8.39697C338.082 8.4103 325.218 8.4143 312.315 8.4143L310.175 15.237C323.375 15.2383 336.571 15.233 349.771 15.245C352.515 15.249 355.287 15.325 357.994 15.717C365.442 16.797 368.906 20.341 369.549 27.7863C370.647 40.5183 371.547 53.269 372.583 66.6996C365.827 66.6996 359.538 66.589 353.255 66.7516C350.782 66.8183 349.049 66.0916 347.339 64.2823C340.633 57.1756 333.799 50.1916 326.954 43.2183C324.837 41.0623 322.738 39.2276 319.165 39.257C313.651 39.305 308.137 39.301 302.625 39.3196L300.495 46.1156C305.831 46.1036 311.169 46.101 316.509 46.0716C319.147 46.0556 321.021 46.7716 322.846 48.7023C329.735 55.997 336.873 63.0543 343.727 70.3796C345.907 72.7116 348.154 73.6836 351.342 73.589C358.543 73.3783 365.753 73.525 373.237 73.525V93.597H328.055C325.225 84.8303 319.629 79.4383 310.382 79.397C300.893 79.353 295.351 85.025 292.506 93.8623H268.971L266.766 100.892H292.217C293.411 101.544 293.359 103.012 293.893 104.132C297.199 111.061 302.633 114.96 310.325 114.972C318.018 114.986 323.697 111.186 326.614 104.098C327.762 101.301 329.117 100.608 331.905 100.63C346.155 100.756 360.406 100.58 374.657 100.748C378.87 100.797 380.27 99.2663 380.367 95.069C380.817 75.7476 378.498 56.5983 377.17 37.3876C377.015 35.1436 376.825 32.9023 376.647 30.6023C379.727 29.9063 380.817 31.293 381.058 33.9716C381.45 38.325 381.982 42.665 382.427 47.0143C382.655 49.2383 383.762 50.9116 386.031 50.7676C388.531 50.6076 389.551 48.7863 389.265 46.289Z" fill="#1D1D1C"></path><path d="M297.271 61.7578C297.515 61.3885 297.663 60.9138 297.717 60.3325L297.271 61.7578Z" fill="white"></path><path d="M252.214 100.857H272.386L322.254 8.39827H291.612L262.204 60.6503L231.402 8.39827H199.972L171.4 59.1623L148.504 20.3209L133.057 48.7383L151.996 77.8729L166.937 100.857H182.856L217.782 40.2049L252.214 100.857Z" fill="#264673"></path><path d="M118.531 64.0054L87.9068 8.70808H56.8414L8.94678 100.545H42.0241L73.2681 38.3561L103.923 100.545H133.191L180.985 8.70808H147.773L118.531 64.0054Z" fill="#EE712D"></path><path d="M55.9538 173.773V168.542C55.9538 166.481 55.4205 164.962 54.3511 163.986C53.2831 163.01 51.6338 162.522 49.4031 162.522C45.0818 162.522 41.3538 165.166 38.2178 170.451V173.773H55.9538ZM21.9791 189.093C19.3125 189.093 16.9911 188.594 15.0178 187.598C13.0431 186.602 11.5391 185.201 10.5018 183.394C9.46447 181.587 8.9458 179.515 8.9458 177.178C8.9458 175.573 9.16314 173.937 9.60047 172.269C10.0378 170.601 10.6391 169.103 11.4031 167.774H17.7205C17.2205 169.297 16.8231 170.891 16.5271 172.558C16.2298 174.226 16.0831 175.779 16.0831 177.218C16.0831 179.281 16.6671 180.925 17.8378 182.149C19.0071 183.374 20.5511 183.986 22.4711 183.986H23.8978C26.3631 183.986 28.1751 183.394 29.3378 182.211C30.4991 181.027 31.0818 179.363 31.0818 177.218V157.831H38.2178V165.283C41.1351 160.039 45.4631 157.415 51.2045 157.415C55.1351 157.415 58.0991 158.333 60.0951 160.166C62.0925 161.999 63.0911 164.834 63.0911 168.666V178.879H38.1711C37.9365 182.229 36.6271 184.767 34.2405 186.497C31.8538 188.227 28.4685 189.093 24.0858 189.093H21.9791Z" fill="#1D1D1C"></path><path d="M81.9821 173.773C82.1381 173.773 82.2168 173.829 82.2168 173.939V178.671C82.2168 178.81 82.1381 178.879 81.9821 178.879H68.8555V146.581H75.9928V173.773H81.9821Z" fill="#1D1D1C"></path><path d="M90.6634 189.507C89.6648 189.507 88.8768 189.234 88.3008 188.687C87.7234 188.141 87.4341 187.397 87.4341 186.455C87.4341 185.502 87.7194 184.75 88.2888 184.203C88.8581 183.657 89.6488 183.385 90.6634 183.385C91.6314 183.385 92.3994 183.654 92.9688 184.194C93.5368 184.733 93.8221 185.487 93.8221 186.455C93.8221 187.397 93.5301 188.141 92.9448 188.687C92.3594 189.234 91.5994 189.507 90.6634 189.507ZM81.5141 178.879C81.3581 178.879 81.2808 178.811 81.2808 178.673V173.939C81.2808 173.829 81.3581 173.773 81.5141 173.773H87.5048V157.831H94.6408V178.879H81.5141Z" fill="#1D1D1C"></path><path d="M130.062 157.811C129.079 157.811 128.299 157.537 127.722 156.991C127.144 156.445 126.856 155.7 126.856 154.759C126.856 153.805 127.14 153.055 127.71 152.507C128.279 151.961 129.063 151.688 130.062 151.688C131.06 151.688 131.84 151.961 132.402 152.507C132.963 153.055 133.244 153.805 133.244 154.759C133.244 155.7 132.951 156.445 132.367 156.991C131.782 157.537 131.014 157.811 130.062 157.811ZM121.919 157.811C120.936 157.811 120.155 157.537 119.579 156.991C119.002 156.445 118.712 155.7 118.712 154.759C118.712 153.805 118.998 153.055 119.567 152.507C120.138 151.961 120.92 151.688 121.919 151.688C122.902 151.688 123.674 151.957 124.235 152.497C124.796 153.036 125.078 153.791 125.078 154.759C125.078 155.728 124.79 156.479 124.211 157.012C123.635 157.544 122.87 157.811 121.919 157.811ZM118.432 178.88C115.483 178.88 113.155 178.119 111.447 176.596C109.74 175.075 108.886 172.984 108.886 170.328C108.886 169.263 109.027 168.124 109.307 166.913C109.588 165.703 109.962 164.675 110.43 163.831H116.748C116.263 165.672 116.023 167.525 116.023 169.393C116.023 170.708 116.435 171.767 117.262 172.569C118.09 173.372 119.182 173.773 120.538 173.773H136.098V157.832H143.258V173.773H187.367C187.524 173.773 187.6 173.829 187.6 173.94V178.672C187.6 178.811 187.524 178.88 187.367 178.88H118.432Z" fill="#264673"></path><path d="M186.899 178.879C186.745 178.879 186.665 178.81 186.665 178.671V173.939C186.665 173.829 186.745 173.773 186.899 173.773H192.889V161.153H200.026V173.773H204.098C205.689 173.773 206.855 173.382 207.595 172.601C208.337 171.819 208.707 170.57 208.707 168.854V161.153H215.845V169.351C215.845 170.043 215.797 170.681 215.705 171.262C216.483 172.189 217.262 172.839 218.043 173.213C218.823 173.586 219.829 173.773 221.062 173.773H224.034V157.831H231.17V178.879H221.203C218.503 178.879 215.999 177.814 213.691 175.683C211.897 177.814 209.23 178.879 205.689 178.879H186.899Z" fill="#264673"></path><path d="M251.442 173.773V162.938H249.898C247.854 162.938 246.26 163.45 245.113 164.474C243.966 165.498 243.393 166.943 243.393 168.811C243.393 170.514 243.784 171.767 244.564 172.569C245.344 173.371 246.536 173.773 248.142 173.773H251.442ZM245.92 189.093C243.75 189.093 241.876 188.943 240.293 188.646C238.709 188.347 237.185 187.811 235.718 187.037L238.502 182.409C239.798 183.003 241.022 183.422 242.177 183.663C243.33 183.906 244.53 184.027 245.78 184.027C247.589 184.027 248.985 183.587 249.969 182.709C250.95 181.83 251.442 180.623 251.442 179.087V178.879H246.692C243.276 178.879 240.648 178.022 238.806 176.305C236.966 174.59 236.046 172.147 236.046 168.978C236.046 166.737 236.678 164.769 237.941 163.073C239.204 161.378 240.99 160.079 243.3 159.181C245.608 158.281 248.276 157.831 251.302 157.831H258.58V179.003C258.58 182.229 257.474 184.715 255.268 186.466C253.061 188.217 249.945 189.093 245.92 189.093Z" fill="#264673"></path><path d="M293.789 157.811C292.79 157.811 292.003 157.537 291.426 156.991C290.849 156.445 290.561 155.7 290.561 154.759C290.561 153.805 290.845 153.055 291.415 152.507C291.983 151.961 292.774 151.688 293.789 151.688C294.757 151.688 295.525 151.957 296.094 152.497C296.663 153.036 296.949 153.791 296.949 154.759C296.949 155.7 296.655 156.445 296.071 156.991C295.485 157.537 294.725 157.811 293.789 157.811ZM289.695 150.961C288.93 150.961 288.286 150.747 287.763 150.317C287.241 149.889 286.981 149.239 286.981 148.367C286.981 147.467 287.241 146.813 287.763 146.405C288.286 145.997 288.93 145.792 289.695 145.792C290.521 145.792 291.183 146.02 291.683 146.477C292.182 146.933 292.431 147.564 292.431 148.367C292.431 149.141 292.186 149.767 291.695 150.245C291.205 150.723 290.538 150.961 289.695 150.961ZM285.623 157.811C284.641 157.811 283.861 157.537 283.283 156.991C282.705 156.445 282.418 155.7 282.418 154.759C282.418 153.805 282.702 153.055 283.271 152.507C283.841 151.961 284.625 151.688 285.623 151.688C286.621 151.688 287.401 151.961 287.963 152.507C288.525 153.055 288.806 153.805 288.806 154.759C288.806 155.7 288.513 156.445 287.927 156.991C287.343 157.537 286.574 157.811 285.623 157.811ZM282.371 178.88C279.423 178.88 277.094 178.119 275.386 176.596C273.678 175.075 272.823 172.984 272.823 170.328C272.823 169.263 272.965 168.124 273.245 166.913C273.526 165.703 273.901 164.675 274.369 163.831H280.686C280.203 165.672 279.961 167.525 279.961 169.393C279.961 170.708 280.373 171.767 281.201 172.569C282.027 173.372 283.119 173.773 284.477 173.773H300.037V157.832H307.198V178.88H282.371Z" fill="#EE712D"></path><path d="M315.535 189.093C313.896 189.093 312.396 188.919 311.031 188.574C309.667 188.227 308.228 187.605 306.713 186.705L309.592 182.574C310.435 183.045 311.177 183.37 311.827 183.55C312.473 183.73 313.249 183.819 314.155 183.819C315.433 183.819 316.463 183.387 317.243 182.522C318.023 181.657 318.413 180.567 318.413 179.254V157.831H325.551V179.565C325.551 182.485 324.64 184.803 322.824 186.518C321.007 188.234 318.576 189.093 315.535 189.093Z" fill="#EE712D"></path><path d="M345.822 173.773V162.938H344.278C342.234 162.938 340.638 163.45 339.493 164.474C338.346 165.498 337.773 166.943 337.773 168.811C337.773 170.514 338.162 171.767 338.942 172.569C339.722 173.371 340.914 173.773 342.521 173.773H345.822ZM358.949 173.773C359.103 173.773 359.182 173.829 359.182 173.939V178.671C359.182 178.81 359.103 178.879 358.949 178.879H352.958C352.958 182.118 351.854 184.629 349.647 186.414C347.439 188.199 344.323 189.093 340.298 189.093C338.13 189.093 336.254 188.943 334.671 188.646C333.089 188.347 331.563 187.811 330.097 187.037L332.882 182.409C334.177 183.003 335.402 183.422 336.555 183.663C337.71 183.906 338.91 184.027 340.159 184.027C341.967 184.027 343.365 183.587 344.347 182.709C345.33 181.83 345.822 180.623 345.822 179.087V178.879H341.071C337.655 178.879 335.026 178.022 333.185 176.305C331.346 174.59 330.425 172.147 330.425 168.978C330.425 166.737 331.057 164.769 332.319 163.073C333.583 161.378 335.37 160.079 337.678 159.181C339.986 158.281 342.654 157.831 345.682 157.831H352.958V173.773H358.949Z" fill="#EE712D"></path><path d="M376.891 154.179C375.892 154.179 375.104 153.905 374.528 153.359C373.951 152.812 373.662 152.068 373.662 151.127C373.662 150.172 373.947 149.421 374.516 148.875C375.086 148.328 375.876 148.055 376.891 148.055C377.859 148.055 378.626 148.325 379.196 148.864C379.764 149.404 380.05 150.159 380.05 151.127C380.05 152.068 379.756 152.812 379.172 153.359C378.587 153.905 377.827 154.179 376.891 154.179ZM358.479 178.88C358.324 178.88 358.247 178.811 358.247 178.672V173.94C358.247 173.829 358.324 173.773 358.479 173.773H373.38V157.832H380.518V178.88H358.479Z" fill="#EE712D"></path></svg>`
    const now = new Date()
    const printDate = now.toLocaleDateString('en-GB')
    const printTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    const printerName = profile?.full_name_ar ?? profile?.full_name ?? '—'
    const employeeName = sale?.employee_name ?? '—'
    const jobNumber = sale?.created_by_user?.job_number ?? '—'
    const stationName = sale?.station?.name_ar ?? sale?.station?.name_en ?? '—'
    const accountantName = sale?.confirmed_by_name ?? '—'
    const totalActualVal = (Number(sale?.cash_amount??0) + Number(sale?.mada_amount??0) + Number(sale?.visa_amount??0) + Number(sale?.mastercard_amount??0) + Number(sale?.other_amount??0))
    const diff = totalActualVal - Number(sale?.total_expected??0)
    const hasDeficit = diff < 0
    const deficitAcknowledged = sale?.accountant_notes?.includes('تم إقرار العجز')
    const shiftLabel = { A: isAr ? 'الوردية أ' : 'Shift A', B: isAr ? 'الوردية ب' : 'Shift B', C: isAr ? 'الوردية ج' : 'Shift C' }[sale?.shift] ?? sale?.shift ?? '—'

    const html = `<!DOCTYPE html><html dir="${dir}"><head>
      <meta charset="UTF-8"/>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Tajawal', Arial, sans-serif; background: #fff; color: #1a1a2e; direction: ${dir}; font-size: 13px; }
        .page { max-width: 720px; margin: 0 auto; padding: 28px 32px; }
        @page { size: A4; margin: 12mm; }

        /* Header */
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1B3A6B; padding-bottom: 14px; margin-bottom: 16px; }
        .header-right h1 { font-size: 20px; font-weight: 700; color: #1B3A6B; }
        .header-right .sys { font-size: 11px; color: #888; margin-top: 2px; }
        .header-left { text-align: ${isAr ? 'left' : 'right'}; }
        .header-left .doc-title { font-size: 15px; font-weight: 700; color: #1B3A6B; }
        .header-left .doc-date { font-size: 11px; color: #666; margin-top: 3px; }
        .confirmed-stamp { display: inline-block; border: 2px solid #16a34a; color: #16a34a; border-radius: 6px; padding: 2px 10px; font-size: 12px; font-weight: 700; margin-top: 6px; letter-spacing: 1px; }

        /* Meta row */
        .meta { display: flex; gap: 0; margin-bottom: 16px; border: 1px solid #d1d5db; border-radius: 6px; overflow: hidden; }
        .meta-cell { flex: 1; padding: 8px 14px; border-${isAr ? 'left' : 'right'}: 1px solid #d1d5db; background: #f8fafc; }
        .meta-cell:last-child { border: none; }
        .meta-cell .label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: .5px; }
        .meta-cell .value { font-size: 13px; font-weight: 600; color: #1a1a2e; margin-top: 2px; }

        /* Main table */
        table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
        thead tr { background: #1B3A6B; color: #fff; }
        thead th { padding: 9px 14px; font-size: 12px; font-weight: 600; text-align: ${isAr ? 'right' : 'left'}; }
        tbody tr:nth-child(even) { background: #f8fafc; }
        tbody tr:hover { background: #f0f4fa; }
        tbody td { padding: 8px 14px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
        tbody td.label-col { color: #374151; font-weight: 600; width: 45%; }
        tbody td.value-col { color: #1a1a2e; }
        tbody td.amount { font-weight: 600; color: #1B3A6B; font-variant-numeric: tabular-nums; }

        /* Totals section */
        .totals { border: 1px solid #d1d5db; border-radius: 6px; overflow: hidden; margin-top: 14px; }
        .totals-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 16px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
        .totals-row:last-child { border: none; }
        .totals-row.highlight { background: #1B3A6B; color: #fff; font-weight: 700; font-size: 14px; }
        .totals-row.surplus { background: #f0fdf4; color: #15803d; font-weight: 700; }
        .totals-row.deficit { background: #fef2f2; color: #dc2626; font-weight: 700; }
        .totals-row .t-label { }
        .totals-row .t-value { font-variant-numeric: tabular-nums; }

        /* Footer */
        .footer { margin-top: 28px; border-top: 2px solid #e5e7eb; padding-top: 14px; display: flex; justify-content: space-between; font-size: 11px; color: #6b7280; }
        .footer .sig-box { border-top: 1px solid #9ca3af; padding-top: 4px; min-width: 140px; text-align: center; font-size: 11px; color: #374151; }
        .footer .sig-label { font-size: 10px; color: #9ca3af; margin-bottom: 20px; }
        .print-footer { margin-top: 14px; border-top: 1px solid #d1d5db; padding-top: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #6b7280; }
        .print-footer .pf-left { display: flex; gap: 18px; }
        .print-footer strong { color: #374151; }
        .system-info { font-size: 10px; color: #9ca3af; text-align: center; margin-top: 10px; }

        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .page { padding: 0; max-width: 100%; width: 100%; }
          table { table-layout: fixed; }
          td, th { word-wrap: break-word; overflow-wrap: anywhere; }
        }
      </style>
    </head><body>
    <div class="page">

      <!-- Header -->
      <div class="header">
        <div class="header-right">
          ${logoSvg}
          <div class="sys" style="margin-top:4px">Station System — نظام المحطة</div>
          <div class="confirmed-stamp">&#10003; ${isAr ? 'سجل مؤكد' : 'CONFIRMED'}</div>
        </div>
        <div class="header-left">
          <div class="doc-title">${isAr ? 'كشف الإيرادات اليومية' : 'Daily Revenue Report'}</div>
          <div class="doc-date">${isAr ? 'تاريخ السجل:' : 'Record Date:'} ${sale?.sale_date ?? '—'}</div>
          <div class="doc-date">${isAr ? 'المحطة:' : 'Station:'} ${stationName}</div>
        </div>
      </div>

      <!-- Meta -->
      <div class="meta">
        <div class="meta-cell">
          <div class="label">${isAr ? 'الوردية' : 'Shift'}</div>
          <div class="value">${shiftLabel}</div>
        </div>
        <div class="meta-cell">
          <div class="label">${isAr ? 'اسم الموظف' : 'Employee'}</div>
          <div class="value">${employeeName}</div>
        </div>
        <div class="meta-cell">
          <div class="label">${isAr ? 'الرقم الوظيفي' : 'Job No.'}</div>
          <div class="value" style="font-family:monospace;font-size:14px;font-weight:700;color:#1B3A6B">${jobNumber}</div>
        </div>
        <div class="meta-cell">
          <div class="label">${isAr ? 'رقم الموازنة' : 'Balance Ref'}</div>
          <div class="value">${parseRefs(sale?.balance_ref) || '—'}</div>
        </div>
      </div>

      <!-- Sales Table -->
      <table>
        <thead>
          <tr>
            <th>${isAr ? 'البيان' : 'Description'}</th>
            <th style="text-align:${isAr?'left':'right'}">${isAr ? 'المبلغ (ر.س)' : 'Amount (SAR)'}</th>
          </tr>
        </thead>
        <tbody>
          <tr><td class="label-col">${isAr ? 'مبيعات كاش' : 'Cash Sales'}</td><td class="value-col amount" style="text-align:${isAr?'left':'right'}">${fmt(sale?.cash_amount)}</td></tr>
          <tr><td class="label-col">${isAr ? 'مبيعات مدى' : 'Mada Sales'}</td><td class="value-col amount" style="text-align:${isAr?'left':'right'}">${fmt(sale?.mada_amount)}</td></tr>
          <tr><td class="label-col">${isAr ? 'مبيعات فيزا' : 'Visa Sales'}</td><td class="value-col amount" style="text-align:${isAr?'left':'right'}">${fmt(sale?.visa_amount)}</td></tr>
          <tr><td class="label-col">${isAr ? 'مبيعات ماستركارد' : 'Mastercard Sales'}</td><td class="value-col amount" style="text-align:${isAr?'left':'right'}">${fmt(sale?.mastercard_amount)}</td></tr>
          <tr><td class="label-col">${isAr ? 'مبيعات أخرى' : 'Other Sales'}${sale?.other_type ? ` (${sale.other_type})` : ''}</td><td class="value-col amount" style="text-align:${isAr?'left':'right'}">${fmt(sale?.other_amount)}</td></tr>
          ${sale?.bank_deposit_amount ? `<tr><td class="label-col">${isAr ? 'المودع بالبنك' : 'Bank Deposit'}</td><td class="value-col amount" style="text-align:${isAr?'left':'right'}">${fmt(sale?.bank_deposit_amount)}</td></tr>` : ''}
          ${sale?.accountant_notes ? `<tr><td class="label-col">${isAr ? 'ملاحظات المحاسب' : 'Accountant Notes'}</td><td class="value-col">${sale.accountant_notes}</td></tr>` : ''}
        </tbody>
      </table>

      <!-- Totals -->
      <div class="totals">
        <div class="totals-row">
          <span class="t-label">${isAr ? 'المبلغ المتوقع' : 'Expected Amount'}</span>
          <span class="t-value">${fmt(sale?.total_expected)} ر.س</span>
        </div>
        <div class="totals-row highlight">
          <span class="t-label">${isAr ? 'إجمالي الإيرادات الفعلي' : 'Actual Total Revenue'}</span>
          <span class="t-value">${fmt(totalActualVal)} ر.س</span>
        </div>
        <div class="totals-row ${diff >= 0 ? 'surplus' : 'deficit'}">
          <span class="t-label">${diff >= 0 ? (isAr ? '▲ فائض' : '▲ Surplus') : (isAr ? '▼ عجز' : '▼ Deficit')}</span>
          <span class="t-value">${fmt(Math.abs(diff))} ر.س</span>
        </div>
      </div>

      <!-- Deficit Acknowledgment Box -->
      ${hasDeficit ? `
      <div style="margin-top:14px;border:2px solid #dc2626;border-radius:8px;padding:14px;background:#fff5f5;direction:${dir}">
        <div style="font-size:13px;font-weight:700;color:#dc2626;margin-bottom:8px">
          ⚠ ${isAr ? 'إقرار العجز' : 'Deficit Acknowledgment'}
        </div>
        <div style="font-size:12px;color:#374151;line-height:2">
          <div>${isAr ? 'مبلغ العجز:' : 'Deficit Amount:'} <strong style="color:#dc2626">${fmt(Math.abs(diff))} ${isAr ? 'ر.س' : 'SAR'}</strong></div>
          <div>${isAr ? 'اسم الموظف:' : 'Employee:'} <strong>${employeeName}</strong></div>
          <div>${isAr ? 'الرقم الوظيفي:' : 'Job No.:'} <strong style="font-family:monospace">${jobNumber}</strong></div>
          <div>${isAr ? 'اعتمد بواسطة المحاسب:' : 'Approved by Accountant:'} <strong>${accountantName}</strong></div>
          <div>${isAr ? 'المحطة:' : 'Station:'} <strong>${stationName}</strong></div>
          <div style="margin-top:6px;padding:6px 10px;background:${deficitAcknowledged ? '#dcfce7' : '#fef2f2'};border-radius:4px;font-weight:700;color:${deficitAcknowledged ? '#15803d' : '#dc2626'}">
            ${deficitAcknowledged
              ? (isAr ? '✓ تم إقرار العجز وتحميله على الموظف من قِبل محاسب المحطة' : '✓ Deficit acknowledged and charged to employee by station accountant')
              : (isAr ? '⚠ لم يتم إقرار العجز بعد' : '⚠ Deficit not yet acknowledged')}
          </div>
        </div>
      </div>` : ''}

      <!-- Signature / Footer -->
      <div class="footer">
        <div>
          <div class="sig-label">${isAr ? 'توقيع الموظف' : 'Employee Signature'}</div>
          <div class="sig-box">${employeeName}${jobNumber !== '—' ? `<br><span style="font-size:10px;color:#888">${isAr ? 'رقم وظيفي:' : 'Job No:'} ${jobNumber}</span>` : ''}</div>
        </div>
        <div style="text-align:center">
          <div class="sig-label">${isAr ? 'اعتماد محاسب المحطة' : 'Station Accountant Approval'}</div>
          <div class="sig-box">${accountantName}</div>
        </div>
      </div>

      <!-- Print info footer -->
      <div class="print-footer">
        <div class="pf-left">
          <span><strong>${isAr ? 'طُبع بواسطة:' : 'Printed by:'}</strong> ${printerName}</span>
          <span><strong>${isAr ? 'التاريخ:' : 'Date:'}</strong> ${printDate}</span>
          <span><strong>${isAr ? 'الوقت:' : 'Time:'}</strong> ${printTime}</span>
        </div>
        <div style="color:#9ca3af">Station System — نظام المحطة</div>
      </div>
    </div>
    </body></html>`

    const style = document.createElement('style')
    style.id = '__nwbus_print_style__'
    style.textContent = `
      @media print {
        body > *:not(#__nwbus_print_div__) { display:none!important; }
        #__nwbus_print_div__ { display:block!important; position:static!important; }
      }
    `
    document.head.appendChild(style)

    // استخراج بلوك التنسيق من <head> حتى لا تضيع تنسيقات الـ classes عند الطباعة
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i)
    const printCss = styleMatch ? styleMatch[1] : ''

    const body = html
      .replace(/[\s\S]*<body[^>]*>/i, '')
      .replace(/<\/body>[\s\S]*/i, '')

    const div = document.createElement('div')
    div.id = '__nwbus_print_div__'
    div.style.cssText = 'position:fixed;top:-99999px;left:0;width:100%;direction:' + (isAr ? 'rtl' : 'ltr')
    // حقن التنسيق داخل عنصر الطباعة نفسه ليُطبَّق على الـ classes
    div.innerHTML = `<style>${printCss}</style>${body}`
    document.body.appendChild(div)

    // استدعاء مباشر بدون timeout للحفاظ على user gesture
    // try/finally ضروري حتى لا يبقى div مخفٍ للواجهة عند حدوث خطأ
    try {
      window.print()
    } finally {
      document.body.removeChild(div)
      document.head.removeChild(style)
    }
  }

  const parseInitialRefs = raw => {
    if (!raw) return ['']
    try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : [raw] } catch { return [raw] }
  }

  const [form, setForm] = useState({
    sale_date:         sale?.sale_date          ?? todayStr(),
    shift:             sale?.shift              ?? 'A',
    station_id:        sale?.station_id         ?? profile.station_id ?? '',
    employee_name:     sale?.employee_name      ?? savedEmployee,
    cashier_ref:       sale ? (parseInitialRefs(sale.balance_ref)[0] ?? '') : savedCashier,
    balance_refs:      sale ? (parseInitialRefs(sale.balance_ref).slice(1).length > 0 ? parseInitialRefs(sale.balance_ref).slice(1) : ['']) : [''],
    cash_amount:       sale?.cash_amount        ?? 0,
    mada_amount:       sale?.mada_amount        ?? 0,
    mada_network_ref:  sale?.mada_network_ref   ?? '',
    visa_amount:       sale?.visa_amount        ?? 0,
    mastercard_amount: sale?.mastercard_amount  ?? 0,
    other_amount:      sale?.other_amount       ?? 0,
    other_type:        sale?.other_type         ?? '',
    total_sales:       sale?.total_expected     ?? 0,
    is_confirmed:          sale?.is_confirmed       ?? false,
    accountant_notes:      sale?.accountant_notes   ?? '',
    deficit_acknowledged:  false,
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const totalActual = Math.round(Number(form.cash_amount)) + Math.round(Number(form.mada_amount)) +
    Math.round(Number(form.visa_amount)) + Math.round(Number(form.mastercard_amount)) + Math.round(Number(form.other_amount))
  const diff = totalActual - Math.round(Number(form.total_sales))

  function addBalanceRef()      { set('balance_refs', [...form.balance_refs, '']) }
  function removeBalanceRef(i)  { set('balance_refs', form.balance_refs.filter((_, idx) => idx !== i)) }
  function setBalanceRef(i, v)  { const refs = [...form.balance_refs]; refs[i] = v; set('balance_refs', refs) }
  function persistCashier()   { localStorage.setItem(CASHIER_KEY,  form.cashier_ref)   }
  function persistEmployee()  { localStorage.setItem(EMPLOYEE_KEY, form.employee_name) }

  async function handleSave(e) {
    e.preventDefault()
    if (isLocked) return
    setSaving(true); setError('')

    const stationId = isGeneralAdmin ? form.station_id : profile.station_id
    if (!stationId) {
      setError(isAr
        ? (isGeneralAdmin ? 'اختر المحطة أولاً' : 'حسابك غير مرتبط بمحطة — تواصل مع الأدمن')
        : (isGeneralAdmin ? 'Please select a station' : 'Your account is not linked to a station'))
      setSaving(false)
      return
    }

    const filteredRefs = [form.cashier_ref.trim(), ...form.balance_refs].filter(r => r.trim())
    const balanceRefStr = filteredRefs.length > 0 ? JSON.stringify(filteredRefs) : null

    const payload = {
      station_id:         stationId,
      sale_date:          form.sale_date,
      shift:              form.shift,
      employee_name:      form.employee_name.trim() || null,
      cash_amount:        Number(form.cash_amount),
      mada_amount:        Number(form.mada_amount),
      mada_network_ref:   form.mada_network_ref || null,
      visa_amount:        Number(form.visa_amount),
      mastercard_amount:  Number(form.mastercard_amount),
      other_amount:       Number(form.other_amount),
      other_type:         form.other_type || null,
      total_expected:     Number(form.total_sales),
      balance_ref:        balanceRefStr,
      bank_deposit_amount: 0,
      bank_deposit_ref:   null,
      created_by:         profile.id,
      created_by_name:    profile.full_name_ar,
    }

    if (isAccountant && form.is_confirmed) {
      payload.is_confirmed        = true
      payload.confirmed_by        = profile.id
      payload.confirmed_by_name   = profile.full_name_ar
      payload.confirmed_at        = new Date().toISOString()
      // Strip any previous deficit annotation to avoid duplicating on re-save
      const baseNotes = (form.accountant_notes || '').replace(/\n?\[عجز[^\]]*\]/g, '').trim()
      payload.accountant_notes = baseNotes || null
      if (diff < 0) {
        payload.accountant_notes = (baseNotes ? baseNotes + '\n' : '') +
          `[عجز ${fmt(Math.abs(diff))} ر.س — ${form.deficit_acknowledged ? 'تم إقرار العجز على الموظف ✓' : 'لم يتم إقرار العجز'}]`
      }
    }

    let res
    if (sale) {
      res = await supabase.from('sales_records').update({
        ...payload,
        updated_by:      profile.id,
        updated_by_name: profile.full_name_ar,
        updated_at:      new Date().toISOString(),
      }).eq('id', sale.id)
    } else {
      res = await supabase.from('sales_records').insert(payload)
    }

    if (res.error) { setError(res.error.message) }
    else { onSaved(); onClose() }
    setSaving(false)
  }

  const inputCls = "w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none"

  return (
    <div className={`fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4${isLocked ? ' print-modal-root' : ''}`} dir={isAr ? 'rtl' : 'ltr'}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto${isLocked ? ' print-modal-panel' : ''}`}>

        <div className="px-6 py-4 border-b flex items-center justify-between"
          style={{ background: isLocked ? 'linear-gradient(135deg,#374151,#4B5563)' : 'linear-gradient(135deg,#065f46,#059669)' }}>
          <h2 className="font-bold text-white text-base">
            {isLocked ? '🔒' : '💰'}{' '}
            {sale ? (isAr ? 'عرض سجل المبيعات' : 'View Sales Record') : (isAr ? 'إدخال مبيعات' : 'Sales Entry')}
          </h2>
          <button onClick={onClose} className="text-white/50 hover:text-white text-2xl leading-none no-print">×</button>
        </div>

        {/* بانر القفل */}
        {isLocked && (
          <div className="mx-6 mt-4 flex items-center gap-2 bg-gray-100 border border-gray-300 rounded-xl px-4 py-3">
            <span className="text-lg">🔒</span>
            <p className="text-xs font-semibold text-gray-600">
              {isAr ? 'هذا السجل مؤكد ومقفول — لا يمكن التعديل' : 'This record is confirmed and locked — editing is disabled'}
            </p>
          </div>
        )}

        <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
        <fieldset disabled={isLocked} className="space-y-4 disabled:opacity-60">

          {/* ① المحطة — للأدمن فقط */}
          {isGeneralAdmin && (
            <div className="bg-nwbus-primary/5 rounded-xl p-4 border border-nwbus-primary/20">
              <label className="block text-xs font-bold text-nwbus-primary mb-1.5">
                🏢 {isAr ? 'المحطة *' : 'Station *'}
              </label>
              <select
                required={isGeneralAdmin}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none bg-white"
                value={form.station_id}
                onChange={e => set('station_id', e.target.value)}
              >
                <option value="">{isAr ? '— اختر المحطة —' : '— Select Station —'}</option>
                {stations.map(s => (
                  <option key={s.id} value={s.id}>{isAr ? s.name_ar : s.name_en}</option>
                ))}
              </select>
            </div>
          )}

          {/* ② اسم الموظف */}
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
            <label className="block text-xs font-bold text-blue-800 mb-1.5">
              👤 {isAr ? 'اسم الموظف' : 'Employee Name'}
            </label>
            <div className="flex gap-2">
              <input
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none bg-white"
                value={form.employee_name}
                onChange={e => set('employee_name', e.target.value)}
                placeholder={isAr ? 'أدخل اسم الموظف' : 'Enter employee name'}
              />
              <button type="button" onClick={persistEmployee}
                className="shrink-0 px-3 py-2 bg-blue-500 text-white rounded-lg text-xs font-bold hover:bg-blue-600 transition-colors">
                📌 {isAr ? 'تثبيت' : 'Pin'}
              </button>
            </div>
            {savedEmployee && savedEmployee !== form.employee_name && (
              <button type="button" onClick={() => set('employee_name', savedEmployee)}
                className="text-xs text-blue-700 mt-1.5 underline">
                ↩ {isAr ? `استخدام المثبت: ${savedEmployee}` : `Use pinned: ${savedEmployee}`}
              </button>
            )}
          </div>

          {/* ② رقم الصرافة */}
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
            <label className="block text-xs font-bold text-amber-800 mb-1.5">
              🏧 {isAr ? 'رقم الصرافة' : 'Cashier Number'}
            </label>
            <div className="flex gap-2">
              <input className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none bg-white"
                value={form.cashier_ref} onChange={e => set('cashier_ref', toLatinDigits(e.target.value))}
                placeholder={isAr ? 'أدخل رقم الصرافة' : 'Enter cashier number'} />
              <button type="button" onClick={persistCashier}
                className="shrink-0 px-3 py-2 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 transition-colors">
                📌 {isAr ? 'تثبيت' : 'Pin'}
              </button>
            </div>
            {savedCashier && savedCashier !== form.cashier_ref && (
              <button type="button" onClick={() => set('cashier_ref', savedCashier)}
                className="text-xs text-amber-700 mt-1.5 underline">
                ↩ {isAr ? `استخدام المثبت: ${savedCashier}` : `Use pinned: ${savedCashier}`}
              </button>
            )}
          </div>

          {/* ② أرقام الموازنة (اختياري) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-600">
                📋 {isAr ? 'رقم الموازنة' : 'Budget Reference'}
                <span className="ms-1.5 text-gray-400 font-normal">({isAr ? 'اختياري' : 'optional'})</span>
              </label>
              <button type="button" onClick={addBalanceRef}
                className="text-xs text-nwbus-primary font-semibold hover:underline">
                + {isAr ? 'إضافة رقم' : 'Add another'}
              </button>
            </div>
            {form.balance_refs.map((ref, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input className={inputCls} value={ref}
                  onChange={e => setBalanceRef(i, toLatinDigits(e.target.value))}
                  placeholder={isAr ? 'أدخل رقم الموازنة أو اتركه فارغاً' : 'Enter budget ref or leave blank'} />
                {form.balance_refs.length > 1 && (
                  <button type="button" onClick={() => removeBalanceRef(i)}
                    className="shrink-0 text-red-400 hover:text-red-600 px-2 text-lg">✕</button>
                )}
              </div>
            ))}
          </div>

          {/* ③ التاريخ والوردية */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'التاريخ' : 'Date'}</label>
              <DatePicker inline className={inputCls} isAr={isAr}
                value={form.sale_date} onChange={v => set('sale_date', v)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'الوردية' : 'Shift'}</label>
              <select className={inputCls} value={form.shift} onChange={e => set('shift', e.target.value)}>
                {SHIFTS.map(s => <option key={s.value} value={s.value}>{isAr ? s.ar : s.en}</option>)}
              </select>
            </div>
          </div>

          {/* ④ طرق الدفع */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              {isAr ? 'طرق الدفع' : 'Payment Methods'}
            </p>
            {[
              { key: 'cash_amount',       label: isAr ? 'نقداً' : 'Cash' },
              { key: 'mada_amount',       label: 'مدى / Mada', ref: 'mada_network_ref', refLabel: isAr ? 'رقم مرجعي مدى' : 'Mada Ref' },
              { key: 'visa_amount',       label: 'Visa' },
              { key: 'mastercard_amount', label: 'Mastercard' },
              { key: 'other_amount',      label: isAr ? 'أخرى' : 'Other', ref: 'other_type', refLabel: isAr ? 'نوع الدفع' : 'Payment Type' },
            ].map(field => (
              <div key={field.key}>
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-gray-600 w-28 shrink-0">{field.label}</label>
                  <input type="text" inputMode="numeric" lang="en"
                    className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none bg-white"
                    value={form[field.key]}
                    onChange={e => set(field.key, Math.round(Number(cleanNumber(e.target.value))) || 0)}
                    onFocus={e => e.target.select()} />
                </div>
                {field.ref && Number(form[field.key]) > 0 && (
                  <div className="mt-1 ms-28 ps-3">
                    <input placeholder={field.refLabel}
                      className="w-full border rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-nwbus-primary focus:outline-none bg-white"
                      value={form[field.ref]} onChange={e => set(field.ref, toLatinDigits(e.target.value))} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ⑤ إجمالي المبيعات + الفرق */}
          <div className="bg-green-50 rounded-xl p-4 space-y-2 border border-green-200">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-gray-700">{isAr ? 'إجمالي المبيعات:' : 'Total Sales:'}</span>
              <input type="text" inputMode="numeric" lang="en"
                className="w-36 border rounded-lg px-2 py-1.5 text-sm text-right focus:ring-2 focus:ring-green-400 focus:outline-none bg-white"
                value={form.total_sales}
                onChange={e => set('total_sales', Math.round(Number(cleanNumber(e.target.value))) || 0)}
                onFocus={e => e.target.select()} />
            </div>
            <div className="flex justify-between text-sm border-t border-green-200 pt-2">
              <span className="text-gray-500">{isAr ? 'الإجمالي الفعلي:' : 'Actual:'}</span>
              <span className="font-bold text-green-700">{fmt(totalActual)} {isAr ? 'ر.س' : 'SAR'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{isAr ? 'الفرق:' : 'Difference:'}</span>
              <span className={`font-bold ${diff === 0 ? 'text-gray-400' : diff > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {diff >= 0 ? '+' : ''}{fmt(diff)} {isAr ? 'ر.س' : 'SAR'}
              </span>
            </div>
          </div>

          {/* ⑥ تأكيد المحاسب */}
          {isAccountant && sale && (
            <div className="bg-yellow-50 rounded-xl p-4 space-y-3 border border-yellow-200">
              <p className="text-xs font-bold text-yellow-700">{isAr ? 'تأكيد المحاسب' : 'Accountant Confirmation'}</p>

              {/* تنبيه العجز */}
              {diff < 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-bold text-red-700">
                    ⚠ {isAr ? 'يوجد عجز بمقدار' : 'Deficit of'} {fmt(Math.abs(diff))} {isAr ? 'ر.س' : 'SAR'}
                  </p>
                  <p className="text-xs text-red-600">
                    {isAr
                      ? `الموظف: ${sale.employee_name || sale.created_by_name || '—'} · الرقم الوظيفي: ${sale.created_by_user?.job_number || '—'}`
                      : `Employee: ${sale.employee_name || sale.created_by_name || '—'} · Job No: ${sale.created_by_user?.job_number || '—'}`}
                  </p>
                  <label className="flex items-center gap-2 text-xs text-red-700 cursor-pointer font-semibold">
                    <input type="checkbox" className="rounded accent-red-600"
                      checked={form.deficit_acknowledged ?? false}
                      onChange={e => set('deficit_acknowledged', e.target.checked)} />
                    {isAr
                      ? 'أُقر بتحميل العجز على الموظف وأعتمده بصفتي محاسب المحطة'
                      : 'I acknowledge the deficit is charged to the employee and approve as station accountant'}
                  </label>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="rounded"
                  checked={form.is_confirmed} onChange={e => set('is_confirmed', e.target.checked)} />
                {isAr ? 'تأكيد وإغلاق السجل' : 'Confirm and close this record'}
              </label>
              <textarea rows={2} placeholder={isAr ? 'ملاحظات...' : 'Notes...'}
                className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-nwbus-primary focus:outline-none"
                value={form.accountant_notes} onChange={e => set('accountant_notes', e.target.value)} />
            </div>
          )}

        </fieldset>

          {error && <p className="text-red-600 text-xs bg-red-50 rounded p-2 border border-red-100">⚠ {error}</p>}

          <p className="text-xs text-gray-400 border-t pt-2">
            ✍️ {profile?.full_name_ar} · {new Date().toLocaleDateString('ar-SA-u-ca-gregory')}
          </p>

          <div className="flex gap-3">
            {!isLocked && (
              <button type="submit" disabled={saving}
                className="flex-1 bg-green-700 text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-green-800 transition-colors">
                {saving ? (isAr ? 'جارٍ الحفظ...' : 'Saving...') : (isAr ? '💾 حفظ' : '💾 Save')}
              </button>
            )}
            {isLocked && (
              <button type="button" onClick={handlePrint}
                className="flex-1 bg-nwbus-primary text-white py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity">
                {isAr ? '🖨 طباعة' : '🖨 Print'}
              </button>
            )}
            <button type="button" onClick={onClose}
              className={`${isLocked ? '' : ''} px-4 py-2.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50`}>
              {isLocked ? (isAr ? '✕ إغلاق' : '✕ Close') : (isAr ? 'إلغاء' : 'Cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── Audit History Modal ───────────────────────────────── */
function AuditModal({ sale, onClose }) {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const events = []
  if (sale.created_at)   events.push({ label: isAr ? 'إضافة' : 'Created',   by: sale.created_by_name,   at: sale.created_at,   color: 'bg-green-100 text-green-700' })
  if (sale.updated_at)   events.push({ label: isAr ? 'تعديل' : 'Updated',   by: sale.updated_by_name,   at: sale.updated_at,   color: 'bg-blue-100 text-blue-700' })
  if (sale.confirmed_at) events.push({ label: isAr ? 'تأكيد' : 'Confirmed', by: sale.confirmed_by_name, at: sale.confirmed_at, color: 'bg-yellow-100 text-yellow-700' })

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="font-bold text-gray-800 text-sm">📋 {isAr ? 'سجل التعديلات' : 'Audit History'}</h3>
          <button onClick={onClose} className="text-gray-400 text-xl leading-none">×</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {events.map((ev, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className={`text-xs rounded-full px-2.5 py-1 font-bold shrink-0 ${ev.color}`}>{ev.label}</span>
              <div>
                <p className="text-sm font-semibold text-gray-800">{ev.by ?? '—'}</p>
                <p className="text-xs text-gray-400">{fmtD(ev.at)} · {fmtT(ev.at)}</p>
              </div>
            </div>
          ))}
          {events.length === 0 && <p className="text-sm text-gray-400">{isAr ? 'لا توجد سجلات' : 'No records'}</p>}
        </div>
      </div>
    </div>
  )
}

/* ─── Main Page ────────────────────────────────────────── */
export default function SalesPage() {
  const { profile, isAccountant, isStationAdmin, isGeneralAdmin, isEmployee } = useAuth()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const [records,     setRecords]     = useState([])
  const [stations,    setStations]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [modal,       setModal]       = useState(null)
  const [audit,       setAudit]       = useState(null)
  const [deleting,    setDeleting]    = useState(null)
  const today = todayStr()
  const [filterDate,  setFilterDate]  = useState(today)
  const [openDays,    setOpenDays]    = useState({})   // { 'YYYY-MM-DD': true }

  function toggleDay(d) { setOpenDays(p => ({ ...p, [d]: !p[d] })) }

  // افتح اليوم الوحيد تلقائياً عند تحميل السجلات (لا يعمل داخل render)
  useEffect(() => {
    if (records.length === 0) return
    const dates = [...new Set(records.map(r => r.sale_date))].sort((a, b) => b.localeCompare(a))
    if (dates.length === 1) {
      setOpenDays(prev => prev[dates[0]] === undefined ? { [dates[0]]: true } : prev)
    }
  }, [records])

  useEffect(() => {
    if (isGeneralAdmin) {
      supabase.from('stations').select('id,name_ar,name_en').eq('is_active', true).order('name_ar')
        .then(({ data }) => setStations((data ?? []).filter(s => !isRestStation(s))))
    }
  }, [isGeneralAdmin])

  async function handleDelete(id) {
    if (!window.confirm(isAr ? 'هل تريد حذف هذا الإيراد نهائياً؟' : 'Delete this record permanently?')) return
    setDeleting(id)
    const { error } = await supabase.from('sales_records').delete().eq('id', id)
    setDeleting(null)
    if (error) { alert(isAr ? 'فشل الحذف: ' + error.message : 'Delete failed: ' + error.message); return }
    fetchRecords()
  }

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('sales_records')
      .select('*, station:station_id(name_ar, name_en)')
      .eq('sale_date', filterDate)
      .order('sale_date', { ascending: false })
      .order('shift')

    // ── Privacy filters ──────────────────────────────────
    if (isGeneralAdmin) {
      // sees all — no filter
    } else if (isStationAdmin || isAccountant) {
      q = q.eq('station_id', profile.station_id)
    } else {
      q = q.eq('created_by', profile.id)
    }

    const { data, error } = await q
    if (error) { setLoading(false); return }

    // جلب الرقم الوظيفي للموظفين بشكل منفصل
    const rows = data ?? []
    const creatorIds = [...new Set(rows.map(r => r.created_by).filter(Boolean))]
    let jobMap = {}
    if (creatorIds.length > 0) {
      const { data: users } = await supabase
        .from('users').select('id, job_number').in('id', creatorIds)
      if (users) users.forEach(u => { jobMap[u.id] = u.job_number })
    }
    setRecords(rows.map(r => ({ ...r, created_by_user: { job_number: jobMap[r.created_by] ?? null } })))
    setLoading(false)
  }, [filterDate, profile?.id, profile?.station_id, isEmployee, isStationAdmin, isAccountant, isGeneralAdmin])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const totalActualSum   = records.reduce((s, r) => s + Number(r.total_actual   ?? 0), 0)
  const totalExpectedSum = records.reduce((s, r) => s + Number(r.total_expected  ?? 0), 0)
  const confirmed        = records.filter(r => r.is_confirmed).length
  const canAdd           = !isAccountant

  return (
    <div className="p-4 md:p-6" dir={isAr ? 'rtl' : 'ltr'}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-nwbus-primary">💰 {isAr ? 'الإيرادات' : 'Revenue'}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {isGeneralAdmin ? (isAr ? 'جميع المحطات' : 'All stations')
              : isStationAdmin || isAccountant ? (isAr ? 'محطتك فقط' : 'Your station only')
              : (isAr ? 'مبيعاتك الخاصة' : 'Your own entries')}
          </p>
        </div>
        {canAdd && (
          <button onClick={() => setModal('new')}
            className="bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-800 transition-colors">
            + {isAr ? 'إدخال إيرادات' : 'New Entry'}
          </button>
        )}
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-xs text-gray-400">{isAr ? 'التاريخ:' : 'Date:'}</span>
        <DatePicker inline value={filterDate} onChange={setFilterDate} isAr={isAr}
          className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none bg-white" />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: isAr ? 'الإجمالي الفعلي' : 'Actual Total',    val: fmt(totalActualSum) + ' ر.س',    color: 'bg-green-50 text-green-700' },
          { label: isAr ? 'إجمالي المبيعات' : 'Sales Total',      val: fmt(totalExpectedSum) + ' ر.س',  color: 'bg-blue-50 text-blue-700' },
          { label: isAr ? 'الفرق' : 'Difference',
            val: (totalActualSum - totalExpectedSum >= 0 ? '+' : '') + fmt(totalActualSum - totalExpectedSum) + ' ر.س',
            color: totalActualSum >= totalExpectedSum ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700' },
          { label: isAr ? 'مؤكدة' : 'Confirmed', val: `${confirmed} / ${records.length}`, color: 'bg-yellow-50 text-yellow-700' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-3 ${s.color}`}>
            <div className="text-sm font-bold">{s.val}</div>
            <div className="text-xs mt-0.5 text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Records */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">⏳ {isAr ? 'جارٍ التحميل...' : 'Loading...'}</div>
      ) : records.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-2">💰</p>
          <p>{isAr ? 'لا توجد سجلات في هذا اليوم' : 'No records for this date'}</p>
        </div>
      ) : (() => {
        // تجميع السجلات بالأيام
        const byDay = {}
        records.forEach(r => {
          const d = r.sale_date
          if (!byDay[d]) byDay[d] = []
          byDay[d].push(r)
        })
        const days = Object.keys(byDay).sort((a, b) => b.localeCompare(a))

        return (
          <div className="space-y-3">
            {days.map(day => {
              const dayRecs = byDay[day]
              const isOpen = openDays[day] ?? (days.length === 1)
              const dayTotal = dayRecs.reduce((s, r) => s + Number(r.total_actual ?? 0), 0)
              const dayConfirmed = dayRecs.filter(r => r.is_confirmed).length
              const dayHasDeficit = dayRecs.some(r => Number(r.total_actual ?? 0) - Number(r.total_expected ?? 0) < 0)
              const dayLabel = new Date(day + 'T00:00:00').toLocaleDateString('ar-SA-u-ca-gregory', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

              return (
                <div key={day} className="bg-white rounded-2xl shadow overflow-hidden">
                  {/* Day Header — accordion */}
                  <button
                    onClick={() => toggleDay(day)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{isOpen ? '▾' : '▸'}</span>
                      <div className="text-right">
                        <div className="font-bold text-nwbus-primary text-sm">{dayLabel}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {dayRecs.length} {isAr ? 'سجل' : 'records'} · {dayConfirmed} {isAr ? 'مؤكد' : 'confirmed'}
                          {dayHasDeficit && <span className="text-red-500 mr-2"> · ⚠ {isAr ? 'يوجد عجز' : 'deficit'}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-green-700 text-sm font-mono">{fmt(dayTotal)} <span className="text-xs font-normal">ر.س</span></div>
                      <div className="text-xs text-gray-400">{isAr ? 'إجمالي اليوم' : 'Day total'}</div>
                    </div>
                  </button>

                  {/* Day Rows */}
                  {isOpen && (
                    <div className="overflow-x-auto border-t border-gray-100">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 text-xs">
                          <tr>
                            {[
                              isAr ? 'الوردية' : 'Shift',
                              isAr ? 'الموظف' : 'Employee',
                              isAr ? 'نقد' : 'Cash',
                              isAr ? 'مدى' : 'Mada',
                              isAr ? 'الإجمالي الفعلي' : 'Actual',
                              isAr ? 'المتوقع' : 'Expected',
                              isAr ? 'الفرق' : 'Diff',
                              isAr ? 'الحالة' : 'Status',
                              '',
                            ].map((h, i) => (
                              <th key={i} className="px-3 py-2 text-right font-medium whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {dayRecs.map(r => {
                            const diff = Number(r.total_actual ?? 0) - Number(r.total_expected ?? 0)
                            return (
                              <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${diff < 0 && r.is_confirmed ? 'bg-red-50/30' : ''}`}>
                                <td className="px-3 py-3 font-bold text-nwbus-primary">{r.shift}</td>
                                <td className="px-3 py-3 text-xs text-gray-700 max-w-[120px] truncate" title={r.employee_name}>
                                  <div>{r.employee_name || '—'}</div>
                                  <div className="text-gray-400 font-mono">{r.created_by_user?.job_number ? `#${r.created_by_user.job_number}` : ''}</div>
                                </td>
                                <td className="px-3 py-3 font-mono text-xs">{fmt(r.cash_amount)}</td>
                                <td className="px-3 py-3 font-mono text-xs">{fmt(r.mada_amount)}</td>
                                <td className="px-3 py-3 font-mono text-xs font-semibold text-green-700">{fmt(r.total_actual)}</td>
                                <td className="px-3 py-3 font-mono text-xs text-gray-500">{fmt(r.total_expected)}</td>
                                <td className={`px-3 py-3 font-mono text-xs font-semibold ${diff === 0 ? 'text-gray-400' : diff > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                  {diff >= 0 ? '+' : ''}{fmt(diff)}
                                  {diff < 0 && r.is_confirmed && <div className="text-red-400 text-[10px]">{isAr ? 'عجز مُقَر' : 'acknowledged'}</div>}
                                </td>
                                <td className="px-3 py-3">
                                  <span className={`text-xs rounded-full px-2 py-0.5 ${r.is_confirmed ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                    {r.is_confirmed ? (isAr ? 'مؤكد ✓' : 'Confirmed ✓') : (isAr ? 'قيد المراجعة' : 'Pending')}
                                  </span>
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex gap-1 items-center">
                                    <button onClick={() => setAudit(r)}
                                      className="text-xs border border-gray-200 text-gray-400 rounded-lg px-2 py-1 hover:bg-gray-50"
                                      title={isAr ? 'سجل التعديلات' : 'Audit History'}>📋</button>
                                    {r.is_confirmed && !isGeneralAdmin
                                      ? (
                                        <button onClick={() => setModal(r)}
                                          className="text-xs border border-gray-300 text-gray-500 rounded-lg px-3 py-1 hover:bg-gray-50 transition-colors">
                                          🔒 {isAr ? 'عرض' : 'View'}
                                        </button>
                                      ) : (
                                        <button onClick={() => setModal(r)}
                                          className="text-xs border border-nwbus-primary text-nwbus-primary rounded-lg px-3 py-1 hover:bg-nwbus-primary hover:text-white transition-colors">
                                          {isAr ? 'تعديل' : 'Edit'}
                                        </button>
                                      )
                                    }
                                    {isGeneralAdmin && (
                                      <button onClick={() => handleDelete(r.id)}
                                        disabled={deleting === r.id}
                                        className="text-xs border border-red-200 text-red-400 rounded-lg px-2 py-1 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                                        title={isAr ? 'حذف' : 'Delete'}>
                                        {deleting === r.id ? '⏳' : '🗑'}
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}

      {modal && (
        <SalesModal
          sale={modal === 'new' ? null : modal}
          stations={stations}
          onClose={() => setModal(null)}
          onSaved={fetchRecords}
        />
      )}
      {audit && <AuditModal sale={audit} onClose={() => setAudit(null)} />}
    </div>
  )
}
