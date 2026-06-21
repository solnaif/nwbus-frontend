// نقطة الاستراحة ليست محطة ركّاب — تُخفى من قوائم اختيار المحطات
// تُعرّف عبر وسم الاسم "(ONLY REST)" أو كلمة "استراحة"
export const isRestStation = s => {
  const n = `${s?.name_en || ''} ${s?.name_ar || ''}`
  return /only\s*rest|استراحة/i.test(n)
}
