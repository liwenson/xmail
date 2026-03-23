import React, {useState, useEffect, useContext} from 'react';
import {useTranslation} from 'react-i18next';
import MailboxSwitcher from './MailboxSwitcher';
import {MailboxContext} from '../contexts/MailboxContext';
import {AuthContext} from '../contexts/AuthContext';

interface HeaderMailboxProps {
    mailbox: Mailbox | null;
    onMailboxChange: (mailbox: Mailbox) => void;
    domain: string;
    domains: string[];
    isLoading: boolean;
}

const HeaderMailbox: React.FC<HeaderMailboxProps> = ({
                                                         mailbox,
                                                         onMailboxChange,
                                                         domain,
                                                         domains,
                                                         isLoading
                                                     }) => {
    const {t} = useTranslation();
    const {
        createNewMailbox,
        createCustomMailbox,
        mailboxes,
        maxUserMailboxes,
        showSuccessMessage,
        showErrorMessage,
    } = useContext(MailboxContext);
    const {user} = useContext(AuthContext);
    const [isCustomMode, setIsCustomMode] = useState(false);
    const [customAddress, setCustomAddress] = useState('');
    const [selectedDomain, setSelectedDomain] = useState(domain);
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [customAddressError, setCustomAddressError] = useState<string | null>(null);
    const mailboxLimitReached = user?.role !== 'admin' && mailboxes.length >= maxUserMailboxes;
    const mailboxLimitMessage = `普通用户最多只能创建 ${maxUserMailboxes} 个邮箱`;

    useEffect(() => {
        setSelectedDomain(domain);
    }, [domain]);

    if (!mailbox || isLoading) return null;

    // 复制邮箱地址到剪贴板
    const copyToClipboard = () => {
        const fullAddress = mailbox.address.includes('@') ? mailbox.address : `${mailbox.address}@${selectedDomain}`;
        navigator.clipboard.writeText(fullAddress)
            .then(() => {
                // feat: 使用全局通知替换 Tooltip
                showSuccessMessage(t('mailbox.copySuccess'));
            })
            .catch(() => {
                // fix: 使用全局通知函数显示复制失败
                showErrorMessage(t('mailbox.copyFailed'));
            });
    };

    // 更换随机邮箱
    const handleRefreshMailbox = async () => {
        if (mailboxLimitReached) {
            showErrorMessage(mailboxLimitMessage);
            return;
        }

        setIsActionLoading(true);
        const createdMailbox = await createNewMailbox();
        setIsActionLoading(false);

        if (createdMailbox) {
            onMailboxChange(createdMailbox);
        }
    };

    // 创建自定义邮箱
    const handleCreateCustom = async (e: React.FormEvent) => {
        e.preventDefault();

        // 清除之前的错误信息
        setCustomAddressError(null);

        if (!customAddress.trim()) {
            setCustomAddressError(t('mailbox.invalidAddress'));
            return;
        }

        if (mailboxLimitReached) {
            setCustomAddressError(mailboxLimitMessage);
            return;
        }

        setIsActionLoading(true);
        const createdMailbox = await createCustomMailbox(customAddress);
        setIsActionLoading(false);

        if (createdMailbox) {
            onMailboxChange(createdMailbox);

            // 成功后延迟关闭自定义输入框
            setTimeout(() => {
                setIsCustomMode(false);
                setCustomAddress('');
            }, 1500);

        } else {
            return;
        }
    };

    // 取消自定义模式
    const handleCancelCustom = () => {
        setIsCustomMode(false);
        setCustomAddress('');
        setCustomAddressError(null);
    };

    // 移动设备上的邮箱地址显示
    const renderMobileAddress = () => {
        const fullAddress = mailbox.address.includes('@') ? mailbox.address : `${mailbox.address}@${selectedDomain}`;
        const [username, domainPart] = fullAddress.split('@');

        // 如果用户名太长，截断显示
        const displayUsername = username.length > 10 ? `${username.substring(0, 8)}...` : username;

        return (
            <code className="bg-muted px-2 py-1 rounded text-xs font-medium truncate max-w-[120px]">
                {displayUsername}@{domainPart}
            </code>
        );
    };

    // 切换域名
    const handleDomainChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedDomain(e.target.value);
        // [fix] 切换域名后自动更换邮箱
        await handleRefreshMailbox();
    };

    // 按钮基础样式
    const buttonBaseClass = "flex items-center justify-center rounded-md transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";
    const copyButtonClass = `${buttonBaseClass} hover:bg-primary/20 hover:text-primary mx-1`;
    const refreshButtonClass = `${buttonBaseClass} bg-muted hover:bg-primary/20 hover:text-primary mr-1`;
    const customizeButtonClass = `${buttonBaseClass} bg-primary text-primary-foreground hover:bg-primary/80`;

    return (
        <div className="flex items-center w-full sm:w-auto">
            {isCustomMode ? (
                <form onSubmit={handleCreateCustom} className="flex flex-col space-y-2 w-full sm:w-auto">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center">
                            <input
                                type="text"
                                value={customAddress}
                                onChange={(e) => {
                                    setCustomAddress(e.target.value);
                                    if (customAddressError) setCustomAddressError(null);
                                }}
                                className={`w-32 md:w-40 px-2 py-1 text-sm border rounded-l-md focus:outline-none focus:ring-1 focus:ring-primary ${
                                    customAddressError ? 'border-red-500' : ''
                                }`}
                                placeholder={t('mailbox.customAddressPlaceholder')}
                                disabled={isActionLoading}
                            />
                            <span
                                className="flex items-center px-2 py-1 text-sm border-y border-r rounded-r-md bg-muted">
                @
                                {/* [fix]: 为select包裹一个relative容器，用于绝对定位自定义箭头 */}
                                <div className="relative">
                  <select
                      value={selectedDomain}
                      onChange={handleDomainChange}
                      // [fix]: 添加 appearance-none 移除原生样式，并增加padding-right为箭头留出空间
                      className="appearance-none bg-transparent border-none focus:outline-none pl-1 pr-5"
                  >
                    {domains.map(d => (
                        <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                                    {/* [fix]: 添加自定义的下拉箭头图标 */}
                                    <i className="fas fa-chevron-down absolute right-0 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none"></i>
                </div>
              </span>
                        </div>
                        <button
                            type="button"
                            onClick={handleCancelCustom}
                            className="px-2 py-1 text-sm rounded-md bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                            disabled={isActionLoading}
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            className="px-2 py-1 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/80 transition-colors"
                            disabled={isActionLoading}
                        >
                            {isActionLoading ? t('common.loading') : t('common.create')}
                        </button>
                    </div>

                    {/* 错误信息显示 */}
                    {customAddressError && (
                        <div className="text-red-500 text-xs px-1">
                            {customAddressError}
                        </div>
                    )}

                </form>
            ) : (
                <>
                    <div className="flex items-center">
                        {/* 电脑端邮箱地址显示 */}
                        <div className="hidden sm:flex items-center">
                            <code className="bg-muted px-2 py-1 rounded text-sm font-medium flex items-center">
                                {mailbox.address}@
                                {/* [fix]: 为select包裹一个relative容器，用于绝对定位自定义箭头 */}
                                <div className="relative">
                                    <select
                                        value={selectedDomain}
                                        onChange={handleDomainChange}
                                        // [fix]: 添加 appearance-none 移除原生样式，并增加padding-right为箭头留出空间
                                        className="appearance-none bg-transparent border-none focus:outline-none pl-1 pr-4 font-medium"
                                    >
                                        {domains.map(d => (
                                            <option key={d} value={d}>{d}</option>
                                        ))}
                                    </select>
                                    {/* [fix]: 添加自定义的下拉箭头图标 */}
                                    <i className="fas fa-chevron-down absolute right-0 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none"></i>
                                </div>
                            </code>

                            {/* 添加邮箱切换组件 */}
                            <MailboxSwitcher
                                currentMailbox={mailbox}
                                onSwitchMailbox={onMailboxChange}
                                domain={selectedDomain}
                            />

                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={copyToClipboard}
                                    className={`w-8 h-8 ${copyButtonClass}`}
                                    aria-label={t('common.copy')}
                                    title={t('common.copy')}
                                >
                                    <i className="fas fa-copy text-sm"></i>
                                </button>
                            </div>

                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={handleRefreshMailbox}
                                    className={`w-8 h-8 ${refreshButtonClass}`}
                                    disabled={isActionLoading}
                                    title={t('mailbox.refresh')}
                                >
                                    {isActionLoading ? (
                                        <i className="fas fa-spinner fa-spin text-sm"></i>
                                    ) : (
                                        <i className="fas fa-sync-alt text-sm"></i>
                                    )}
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => setIsCustomMode(true)}
                                className={`w-8 h-8 ${customizeButtonClass}`}
                                disabled={isActionLoading}
                                title={t('mailbox.customize')}
                            >
                                <i className="fas fa-edit text-sm"></i>
                            </button>
                        </div>

                    </div>

                    {/* 移动版显示 */}
                    <div className="flex sm:hidden flex-col items-start gap-2 w-full">
                        {/* 邮箱地址和操作按钮 */}
                        <div className="flex items-center flex-wrap gap-1.5 w-full">
                            {renderMobileAddress()}

                            {/* 添加移动版邮箱切换组件 */}
                            <div className="shrink-0">
                                <MailboxSwitcher
                                    currentMailbox={mailbox}
                                    onSwitchMailbox={onMailboxChange}
                                    domain={selectedDomain}
                                />
                            </div>

                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={copyToClipboard}
                                    className={`w-8 h-8 ${copyButtonClass}`}
                                    aria-label={t('common.copy')}
                                    title={t('common.copy')}
                                >
                                    <i className="fas fa-copy text-sm"></i>
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={handleRefreshMailbox}
                                    className={`w-8 h-8 ${refreshButtonClass}`}
                                    disabled={isActionLoading}
                                    title={t('mailbox.refresh')}
                                >
                                    {isActionLoading ? (
                                        <i className="fas fa-spinner fa-spin text-sm"></i>
                                    ) : (
                                        <i className="fas fa-sync-alt text-sm"></i>
                                    )}
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => setIsCustomMode(true)}
                                className={`w-8 h-8 ${customizeButtonClass}`}
                                disabled={isActionLoading}
                                title={t('mailbox.customize')}
                            >
                                <i className="fas fa-edit text-sm"></i>
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default HeaderMailbox; 
