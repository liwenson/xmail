import React, { useState, useEffect } from 'react';
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

  return (
    <header className="border-b">
      <Container>
        <div className="flex items-center justify-between py-3">
          <Link to="/" className="text-2xl font-bold">
            {t('app.title')}
          </Link>
          
          <div className="flex items-center gap-3">
            {/* 用户信息 */}
            {user && (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-muted transition-colors"
                >
                  <span className="text-sm">{user.username}</span>
                  <span className={`px-1.5 py-0.5 text-xs rounded ${
                    user.role === 'admin' 
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                  }`}>
                    {user.role === 'admin' ? 'Admin' : 'User'}
                  </span>
                </button>
                
                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-card rounded-md border shadow-lg z-50">
                    <div className="py-1">
                      {user.role === 'admin' && (
                        <Link
                          to="/admin"
                          className="block px-4 py-2 text-sm hover:bg-muted transition-colors"
                          onClick={() => setShowUserMenu(false)}
                        >
                          {t('admin.title')}
                        </Link>
                      )}
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                      >
                        {t('auth.logout')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {mailbox && (
              <div className="flex items-center bg-muted/70 rounded-md px-3 py-1.5">
                <HeaderMailbox 
                  mailbox={mailbox} 
                  onMailboxChange={onMailboxChange}
                  domain={defaultDomain}
                  domains={emailDomains}
                  isLoading={isLoading}
                />
                <div className="ml-3 pl-3 border-l border-muted-foreground/20 flex items-center">
                  <ThemeSwitcher />
                  <LanguageSwitcher />
                  <a
                    href="https://github.com/zaunist/xmail"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-8 h-8 flex items-center justify-center rounded-md transition-all duration-200 hover:bg-primary/20 hover:text-primary hover:scale-110 ml-1"
                    aria-label="GitHub"
                    title="GitHub"
                  >
                    <i className="fab fa-github text-base"></i>
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </Container>
    </header>
  );
};

export default Header;
