// Trip operational statuses
export const TRIP_STATUSES = [
  { value: 'Normal',                            ar: 'سارت بانتظام',                   en: 'Normal' },
  { value: 'Accident between other vehicles',   ar: 'حادث بين المركبات الأخرى',      en: 'Accident between other vehicles' },
  { value: 'Health (Driver/Passengers)',         ar: 'الصحة (السائق/الركاب)',          en: 'Health (Driver/Passengers)' },
  { value: 'Passenger Misbehavior',             ar: 'سوء سلوك الركاب',               en: 'Passenger Misbehavior' },
  { value: 'Police Control',                    ar: 'سيطرة الشرطة',                  en: 'Police Control' },
  { value: 'Traffic Jam',                       ar: 'الازدحام المروري',               en: 'Traffic Jam' },
  { value: 'Weather',                           ar: 'طقس',                           en: 'Weather' },
  { value: 'Accident with NWB bus',             ar: 'حادث مع حافلة NWB',             en: 'Accident with NWB bus' },
  { value: 'Malfunction inside the station',    ar: 'عطل داخل المحطة',               en: 'Malfunction inside the station' },
  { value: 'Out-of-station malfunction',        ar: 'عطل خارج المحطة',               en: 'Out-of-station malfunction' },
]

// Bus types
export const BUS_TYPES = [
  { value: 'Standard', ar: 'عادي',              en: 'Standard' },
  { value: 'VIP',      ar: 'VIP',               en: 'VIP' },
  { value: 'WCH',      ar: 'ذوي الاحتياجات',    en: 'Wheelchair (WCH)' },
  { value: 'Qaid',     ar: 'قائد',              en: 'Qaid' },
]

// User roles
export const USER_ROLES = [
  { value: 'station_employee', ar: 'موظف',             en: 'Employee' },
  { value: 'accountant',       ar: 'محاسب',             en: 'Accountant' },
  { value: 'station_admin',    ar: 'مشرف المحطة',       en: 'Supervisor' },
  { value: 'general_admin',    ar: 'أدمن عام',          en: 'General Admin' },
]

// Modules (sections of the system)
export const MODULES = [
  { value: 'transportation', ar: 'الترحيل',    en: 'Transportation' },
  { value: 'sales',          ar: 'المبيعات',   en: 'Sales' },
  { value: 'lost_found',     ar: 'الموجودات',  en: 'Lost & Found' },
  { value: 'reports',        ar: 'التقارير',   en: 'Reports' },
]

// Departure accuracy thresholds (minutes)
export const ACCURACY_THRESHOLDS = {
  EARLY:       -2,   // more than 2 min early
  ON_TIME:      5,   // within 5 min
  NOT_ON_TIME: 15,   // within 15 min
  // > 15 = Delayed
}

// Report periods
export const REPORT_PERIODS = [
  { value: 'daily',       ar: 'يومي',        en: 'Daily' },
  { value: 'weekly',      ar: 'أسبوعي',      en: 'Weekly' },
  { value: 'monthly',     ar: 'شهري',        en: 'Monthly' },
  { value: 'quarterly',   ar: 'ربع سنوي',    en: 'Quarterly' },
  { value: 'semi_annual', ar: 'نصف سنوي',    en: 'Semi-Annual' },
  { value: 'annual',      ar: 'سنوي',        en: 'Annual' },
]

// Shifts
export const SHIFTS = ['A', 'B', 'C']

// Lost & Found item types
export const ITEM_TYPES = [
  { value: 'bag',       ar: 'شنطة',          en: 'Bag' },
  { value: 'phone',     ar: 'جوال',          en: 'Phone' },
  { value: 'wallet',    ar: 'محفظة',         en: 'Wallet' },
  { value: 'clothing',  ar: 'ملابس',         en: 'Clothing' },
  { value: 'document',  ar: 'وثائق',         en: 'Documents' },
  { value: 'other',     ar: 'أخرى',          en: 'Other' },
]
