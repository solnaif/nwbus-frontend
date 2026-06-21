// تاريخ محلي بصيغة YYYY-MM-DD — لا يستخدم UTC (toISOString) لتفادي فرق المنطقة الزمنية
// (في السعودية UTC+3 كان يرجّع تاريخ أمس في الساعات الأولى من اليوم)
export const toLocalDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const todayStr = () => toLocalDateStr()
