import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
import HeaderMailbox from './HeaderMailbox';
import Container from './Container';
import { getEmailDomains, getDefaultEmailDomain, EMAIL_DOMAINS, DEFAULT_EMAIL_DOMAIN } from '../config';
import ThemeSwitcher from './ThemeSwitcher';
import { useAuth } from '../hooks/use-auth';

interface HeaderProps {
  mailbox: Mailbox | null;
  onMailboxChange?: (mailbox: Mailbox) => void;
  isLoading?: boolean;
}

const Header: React.FC<HeaderProps> = ({ 
  mailbox = null, 
  onMailboxChange = () => {}, 
  isLoading = false 
}) => {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [emailDomains, setEmailDomains] = useState<string[]>(EMAIL_DOMAINS);
  const [defaultDomain, setDefaultDomain] = useState<string>(DEFAULT_EMAIL_DOMAIN);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  
  // 异步获取邮箱域名配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const domains = await getEmailDomains();
        const defaultDom = await getDefaultEmailDomain();
        setEmailDomains(domains);
        setDefaultDomain(defaultDom);
      } catch (error) {
        console.error('加载邮箱域名配置失败:', error);
      }
    };
    
    loadConfig();
  }, []);
  
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEsc);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  return (
    <header className="border-b">
      <Container>
        <div className="flex items-center justify-between py-4">
          <Link to="/" className="text-2xl font-bold">
            {t('app.title')}
          </Link>
          
          <div className="flex items-center justify-end gap-2 flex-wrap sm:flex-nowrap min-w-0">
            {mailbox && (
              <div className="flex items-center flex-wrap sm:flex-nowrap bg-muted/70 rounded-md px-2.5 py-1.5 gap-2 sm:gap-0">
                <HeaderMailbox 
                  mailbox={mailbox} 
                  onMailboxChange={onMailboxChange}
                  domain={defaultDomain}
                  domains={emailDomains}
                  isLoading={isLoading}
                />
                <div className="sm:ml-3 sm:pl-3 sm:border-l border-muted-foreground/20 flex items-center">
                  <ThemeSwitcher />
                  <LanguageSwitcher />
                  {user && (
                    <div className="relative ml-2" ref={userMenuRef}>
                      <button
                        type="button"
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className="relative w-8 h-8 flex items-center justify-center rounded-md transition-all duration-200 hover:bg-primary/20 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        aria-label={user.username}
                        title={user.username}
                        aria-expanded={showUserMenu}
                      >
                        <i className="fas fa-user text-base"></i>
                        <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-card ${
                          user.role === 'admin' ? 'bg-purple-500' : 'bg-slate-400'
                        }`} />
                      </button>
                      
                      {showUserMenu && (
                        <div className="absolute right-0 mt-2 w-48 bg-card rounded-md border shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-150">
                          <div className="py-1">
                            {user.role === 'admin' && (
                              <Link
                                to="/admin"
                                className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted/80 transition-colors"
                                onClick={() => setShowUserMenu(false)}
                              >
                                <i className="fas fa-cog text-xs text-muted-foreground" />
                                {t('admin.title')}
                              </Link>
                            )}
                            <Link
                              to="/tokens"
                              className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted/80 transition-colors"
                              onClick={() => setShowUserMenu(false)}
                            >
                              <i className="fas fa-key text-xs text-muted-foreground" />
                              {t('tokens.title', 'Token 管理')}
                            </Link>
                            <button
                              type="button"
                              onClick={async () => {
                                setShowUserMenu(false);
                                await handleLogout();
                              }}
                              className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm text-destructive hover:bg-muted/80 transition-colors"
                            >
                              <i className="fas fa-right-from-bracket text-xs" />
                              {t('auth.logout')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {!mailbox && user && (
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="relative w-8 h-8 flex items-center justify-center rounded-md transition-all duration-200 hover:bg-primary/20 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  aria-label={user.username}
                  title={user.username}
                  aria-expanded={showUserMenu}
                >
                  <i className="fas fa-user text-base"></i>
                  <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-card ${
                    user.role === 'admin' ? 'bg-purple-500' : 'bg-slate-400'
                  }`} />
                </button>
                
                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-card rounded-md border shadow-lg z-50 animate-in fade-in-0 zoom-in-95 duration-150">
                    <div className="py-1">
                      {user.role === 'admin' && (
                        <Link
                          to="/admin"
                          className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted/80 transition-colors"
                          onClick={() => setShowUserMenu(false)}
                        >
                          <i className="fas fa-cog text-xs text-muted-foreground" />
                          {t('admin.title')}
                        </Link>
                      )}
                      <Link
                        to="/tokens"
                        className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted/80 transition-colors"
                        onClick={() => setShowUserMenu(false)}
                      >
                        <i className="fas fa-key text-xs text-muted-foreground" />
                        {t('tokens.title', 'Token 管理')}
                      </Link>
                      <button
                        type="button"
                        onClick={async () => {
                          setShowUserMenu(false);
                          await handleLogout();
                        }}
                        className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm text-destructive hover:bg-muted/80 transition-colors"
                      >
                        <i className="fas fa-right-from-bracket text-xs" />
                        {t('auth.logout')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </Container>
    </header>
  );
};

export default Header;
