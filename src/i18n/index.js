import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ar from './ar'
import en from './en'

i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar },
    en: { translation: en },
  },
  lng: localStorage.getItem('nwbus_lang') || 'ar',
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
})

export default i18n
