import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const LanguageSwitcher: React.FC = () => {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const languages = [
    { code: 'zh-CN', name: '简体中文', icon: 'fa-solid fa-language' },
    { code: 'en', name: 'English', icon: 'fa-solid fa-language' },
  ];
  
  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);
  
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-8 h-8 flex items-center justify-center rounded-md transition-colors duration-200 hover:bg-primary/20 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        aria-label={t('settings.language')}
        title={t('settings.language')}
        aria-expanded={isOpen}
      >
        <i className="fas fa-language text-base"></i>
      </button>
      
      {isOpen && (
        <div className="absolute right-0 mt-2 w-40 bg-popover border rounded-md shadow-md z-10">
          <ul className="py-1">
            {languages.map(lang => (
              <li key={lang.code}>
                <button
                  type="button"
                  onClick={() => changeLanguage(lang.code)}
                  className={`w-full text-left px-4 py-2 transition-colors duration-200 hover:bg-primary/10 hover:text-primary ${
                    lang.code === i18n.language ? 'font-bold' : ''
                  }`}
                >
                  {lang.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default LanguageSwitcher; 
