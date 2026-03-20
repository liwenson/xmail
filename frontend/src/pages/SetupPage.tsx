/**
 * 首次管理员设置页面
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/use-auth';
import Container from '../components/Container';

const SetupPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setupAdmin } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    if (password.length < 6) {
      setError('密码长度至少 6 个字符');
      return;
    }

    setIsLoading(true);

    try {
      const result = await setupAdmin(username, password);
      if (result.success) {
        navigate('/');
      } else {
        setError(result.error || '创建失败');
      }
    } catch (err) {
      setError('创建失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container>
      <div className="flex min-h-[80vh] items-center justify-center">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-lg border p-8 shadow-sm">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold">{t('setup.title')}</h1>
              <p className="text-muted-foreground mt-2">
                {t('setup.subtitle')}
              </p>
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium mb-1">
                  {t('auth.username')}
                </label>
                <input
                  type="text"
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={t('setup.usernamePlaceholder')}
                  minLength={3}
                  maxLength={20}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t('setup.usernameHint')}
                </p>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium mb-1">
                  {t('auth.password')}
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={t('setup.passwordPlaceholder')}
                  minLength={6}
                  required
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1">
                  {t('setup.confirmPassword')}
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={t('setup.confirmPasswordPlaceholder')}
                  minLength={6}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? t('common.loading') : t('setup.createButton')}
              </button>
            </form>
          </div>
        </div>
      </div>
    </Container>
  );
};

export default SetupPage;
