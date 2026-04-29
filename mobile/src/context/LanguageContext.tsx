import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Dimensions } from 'react-native';
import { AR, FR, EN, ES, TranslationKey } from '../i18n/translations';

export type Lang = 'ar' | 'fr' | 'en' | 'es';
const STORAGE_LANG_KEY = '@studara/language';

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
  isAr: boolean;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>('fr');
  const [screenW, setScreenW] = useState(() => Dimensions.get('window').width);

  // Restore saved language on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_LANG_KEY).then(saved => {
      if (saved === 'ar' || saved === 'fr' || saved === 'en' || saved === 'es') setLangState(saved as Lang);
    }).catch(() => {});
  }, []);

  // Watch screen width (rotation / split view)
  useEffect(() => {
    // NOTE: On Android, the keyboard can trigger a Dimensions "change" (window height changes).
    // We must ignore those events unless the WIDTH actually changed, otherwise the whole app
    // re-renders on every keystroke / keyboard show-hide, causing inputs to lose focus.
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      const nextW = window.width;
      setScreenW(prev => (prev === nextW ? prev : nextW));
    });
    return () => {
      // RN 0.65+ returns { remove() }, older versions return function
      sub?.remove?.();
    };
  }, []);

  const compact = screenW < 375;

  const compactOverrides = useMemo<Record<Lang, Partial<Record<TranslationKey, string>>>>(() => ({
    fr: {
      'tab.timetable': 'Calendrier',
      'tab.flashcards': 'Cartes',
      'tab.profile': 'Compte',
      'home.stat.cards': 'À réviser',
      'home.stat.reminders': 'Rappels',
      'home.stat.resources': 'Ressources',
      'home.section.today': "Aujourd'hui 📅",
      'home.section.decks': 'Decks 🃏',
      'res.title': 'Bibliothèque 📚',
      'jobs.title': 'Jobs & Stages',
      'housing.title': 'Logement 🏠',
    },
    ar: {
      'tab.timetable': 'الجدول',
      'tab.flashcards': 'بطاقات',
      'tab.profile': 'حسابي',
      'home.stat.cards': 'بطاقات',
      'home.stat.reminders': 'تذكيرات',
      'home.stat.resources': 'مواردي',
      'home.section.today': 'اليوم 📅',
      'home.section.decks': 'مجموعات 🃏',
      'res.title': 'المكتبة 📚',
      'jobs.title': 'وظائف',
      'housing.title': 'سكن 🏠',
    },
    en: {
      'tab.timetable': 'Calendar',
      'tab.flashcards': 'Cards',
      'tab.profile': 'Account',
      'home.stat.reminders': 'Reminders',
      'home.section.today': 'Today 📅',
      'home.section.decks': 'Decks 🃏',
      'res.title': 'Library 📚',
      'jobs.title': 'Jobs',
      'housing.title': 'Housing 🏠',
    },
    es: {
      'tab.timetable': 'Horario',
      'tab.flashcards': 'Cartas',
      'tab.profile': 'Perfil',
      'home.stat.reminders': 'Recordatorios',
      'home.section.today': 'Hoy 📅',
      'home.section.decks': 'Mazos 🃏',
      'res.title': 'Biblioteca 📚',
      'jobs.title': 'Empleos',
      'housing.title': 'Vivienda 🏠',
    },
  }), []);

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    AsyncStorage.setItem(STORAGE_LANG_KEY, newLang).catch(() => {});
  }, []);

  const t = useCallback((key: TranslationKey): string => {
    const dict = lang === 'fr' ? FR : lang === 'en' ? EN : lang === 'es' ? ES : AR;
    const base = dict[key] ?? key;
    if (!compact) return base;
    const short = compactOverrides[lang]?.[key];
    return short ?? base;
  }, [lang, compact, compactOverrides]);

  const isAr = lang === 'ar';
  const isRTL = lang === 'ar';

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, isAr, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextValue => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
};
