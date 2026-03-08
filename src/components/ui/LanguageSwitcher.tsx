import { Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const LANGS = [
  { code: 'de', label: 'DE', name: 'Deutsch' },
  { code: 'en', label: 'EN', name: 'English' },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const current = LANGS.find((l) => l.code === i18n.language) ?? LANGS[0];

  const handleSelect = (code: string) => {
    i18n.changeLanguage(code);
    // Update html lang + dir for RTL-readiness
    document.documentElement.setAttribute('lang', code);
    document.documentElement.setAttribute('dir', i18n.dir(code));
    setOpen(false);
  };

  return (
    <div className="relative">
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 p-2 hover:bg-white/10 rounded-full transition-colors text-xs font-bold tracking-wider"
        aria-label="Sprache wechseln"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Globe size={15} />
        {current.label}
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.ul
              role="listbox"
              initial={{ opacity: 0, y: -6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              className="absolute right-0 mt-1 w-32 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden"
            >
              {LANGS.map((lang) => (
                <li key={lang.code}>
                  <button
                    role="option"
                    aria-selected={lang.code === i18n.language}
                    onClick={() => handleSelect(lang.code)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2 ${
                      lang.code === i18n.language
                        ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-semibold'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="w-5 text-xs font-bold opacity-60">{lang.label}</span>
                    {lang.name}
                  </button>
                </li>
              ))}
            </motion.ul>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
