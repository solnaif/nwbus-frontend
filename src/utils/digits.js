/**
 * تحويل الأرقام العربية (٠١٢٣) والفارسية (۰۱۲۳) إلى لاتينية (0123).
 * تُستخدم في كل خانات الإدخال الرقمية حتى لو كتب المستخدم بالعربي.
 */
export function toLatinDigits(str) {
  if (str == null) return str
  return String(str)
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))   // عربية
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0))   // فارسية
}

/** تحويل الأرقام + إزالة الأصفار البادئة (لحقول الأعداد). */
export function cleanNumber(str) {
  const s = toLatinDigits(str).replace(/[^\d.]/g, '')
  return s.replace(/^0+(?=\d)/, '')
}
