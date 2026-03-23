import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Container from '../components/Container';
import { ApiTokenItem, createApiToken, getApiTokens, revokeApiToken } from '../utils/api';
import { useAuth } from '../hooks/use-auth';

function getErrorMessage(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (value instanceof Error && value.message) {
    return value.message;
  }

  return fallback;
}

const TokensPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tokens, setTokens] = useState<ApiTokenItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isRevokingId, setIsRevokingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<string>('30');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newToken, setNewToken] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<string>('Authorization: Bearer <token>');

  const activeCount = useMemo(() => tokens.filter((token) => token.isActive).length, [tokens]);
  const isAdmin = user?.role === 'admin';

  const formatDate = (timestamp: number | null): string => {
    if (!timestamp) return t('tokens.never', '从未');
    return new Date(timestamp * 1000).toLocaleString();
  };

  const fetchTokens = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getApiTokens();
      if (result.success && result.tokens) {
        setTokens(result.tokens);
      } else {
        setError(getErrorMessage(result.error, t('tokens.fetchFailed', '获取 Token 列表失败')));
      }
    } catch {
      setError(t('tokens.fetchFailed', '获取 Token 列表失败'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setNewToken(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t('tokens.nameRequired', 'Token 名称不能为空'));
      return;
    }

    const parsedDays = expiresInDays.trim() ? Number(expiresInDays) : undefined;
    if (typeof parsedDays === 'number' && (!Number.isFinite(parsedDays) || parsedDays <= 0 || parsedDays > 3650)) {
      setError(t('tokens.invalidExpiry', '过期天数必须在 1 到 3650 之间'));
      return;
    }

    setIsCreating(true);
    try {
      const result = await createApiToken(trimmedName, parsedDays);
      if (result.success && result.token) {
        setNewToken(result.token);
        setTokenUsage(result.usage || 'Authorization: Bearer <token>');
        setSuccess(t('tokens.createSuccess', 'Token 创建成功，仅显示一次，请立即保存'));
        setName('');
        fetchTokens();
      } else {
        setError(getErrorMessage(result.error, t('tokens.createFailed', '创建 Token 失败')));
      }
    } catch {
      setError(t('tokens.createFailed', '创建 Token 失败'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (tokenId: string) => {
    if (!window.confirm(t('tokens.confirmRevoke', '确定要吊销这个 Token 吗？'))) {
      return;
    }

    setError('');
    setSuccess('');
    setIsRevokingId(tokenId);
    try {
      const result = await revokeApiToken(tokenId);
      if (result.success) {
        setSuccess(t('tokens.revokeSuccess', 'Token 吊销成功'));
        fetchTokens();
      } else {
        setError(getErrorMessage(result.error, t('tokens.revokeFailed', 'Token 吊销失败')));
      }
    } catch {
      setError(t('tokens.revokeFailed', 'Token 吊销失败'));
    } finally {
      setIsRevokingId(null);
    }
  };

  const copyToken = async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setSuccess(t('tokens.copySuccess', 'Token 已复制到剪贴板'));
    } catch {
      setError(t('tokens.copyFailed', '复制 Token 失败'));
    }
  };

  return (
    <Container>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('tokens.title', 'Token 管理')}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t('tokens.subtitle', '创建 API Token，用于通过 Authorization Header 访问接口。')}
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            {t('tokens.activeCount', '活跃 Token')}: <span className="font-semibold text-foreground">{activeCount}</span>
          </div>
        </div>

        {(error || success) && (
          <div className={`rounded-md border p-3 text-sm ${error ? 'bg-destructive/10 text-destructive border-destructive/30' : 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-700/50'}`}>
            {error || success}
          </div>
        )}

        <div className="bg-card rounded-lg border shadow-sm p-4 sm:p-6">
          <h2 className="text-lg font-semibold mb-4">{t('tokens.createTitle', '创建新 Token')}</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3 items-end">
            <div>
              <label htmlFor="token-name" className="block text-sm font-medium mb-1">{t('tokens.nameLabel', 'Token 名称')}</label>
              <input
                id="token-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={t('tokens.namePlaceholder', '例如：ci-bot / script-runner')}
                maxLength={64}
                required
              />
            </div>

            <div>
              <label htmlFor="token-expire-days" className="block text-sm font-medium mb-1">{t('tokens.expireLabel', '过期天数')}</label>
              <input
                id="token-expire-days"
                type="number"
                value={expiresInDays}
                onChange={(event) => setExpiresInDays(event.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                min={1}
                max={3650}
                placeholder={t('tokens.expirePlaceholder', '留空表示不过期')}
              />
            </div>

            <button
              type="submit"
              disabled={isCreating}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {isCreating ? t('common.loading') : t('tokens.createButton', '创建 Token')}
            </button>
          </form>
        </div>

        {newToken && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 dark:bg-amber-900/15 dark:border-amber-700/50">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h3 className="font-semibold text-amber-800 dark:text-amber-300">{t('tokens.oneTimeTitle', '请立即保存此 Token')}</h3>
                <p className="text-sm text-amber-700/90 dark:text-amber-200/90">{t('tokens.oneTimeDesc', '这个明文 Token 只会展示一次，刷新页面后将无法再次查看。')}</p>
              </div>
              <button
                type="button"
                onClick={copyToken}
                className="px-3 py-1.5 text-sm rounded-md bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-800/60 dark:text-amber-100 dark:hover:bg-amber-700/70"
              >
                {t('common.copy')}
              </button>
            </div>
            <code className="block w-full break-all rounded-md bg-background border px-3 py-2 text-xs sm:text-sm">{newToken}</code>
            <p className="text-xs text-muted-foreground mt-2">{tokenUsage}</p>
          </div>
        )}

        <div className="bg-card rounded-lg border shadow-sm">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">{t('tokens.listTitle', '已有 Token')}</h2>
          </div>

          {isLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            </div>
          ) : tokens.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <i className="fas fa-key text-3xl mb-3 opacity-60" />
              <p>{t('tokens.empty', '当前还没有 Token')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="bg-muted/40">
                  <tr>
                    {isAdmin && <th className="px-4 py-3 text-left text-sm font-medium">{t('tokens.creator', '创建人')}</th>}
                    <th className="px-4 py-3 text-left text-sm font-medium">{t('tokens.nameLabel', 'Token 名称')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">{t('tokens.status', '状态')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">{t('tokens.createdAt', '创建时间')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">{t('tokens.lastUsedAt', '最近使用')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">{t('tokens.expiresAt', '过期时间')}</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">{t('admin.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tokens.map((token) => (
                    <tr key={token.id} className="hover:bg-muted/30">
                      {isAdmin && (
                        <td className="px-4 py-3 text-sm text-muted-foreground">{token.creatorUsername}</td>
                      )}
                      <td className="px-4 py-3 font-medium">{token.name}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs ${token.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                          {token.isActive ? t('tokens.active', '活跃') : t('tokens.inactive', '已失效')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(token.createdAt)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(token.lastUsedAt)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{token.expiresAt ? formatDate(token.expiresAt) : t('tokens.neverExpire', '永不过期')}</td>
                      <td className="px-4 py-3 text-right">
                        {token.isActive ? (
                          <button
                            type="button"
                            onClick={() => handleRevoke(token.id)}
                            disabled={isRevokingId === token.id}
                            className="text-destructive hover:text-destructive/80 disabled:opacity-60"
                          >
                            {isRevokingId === token.id ? t('common.loading') : t('tokens.revoke', '吊销')}
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t('tokens.revoked', '已吊销')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Container>
  );
};

export default TokensPage;
