import React, { useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MailboxContext } from '../contexts/MailboxContext';

interface MailboxSwitcherProps {
  currentMailbox: Mailbox;
  onSwitchMailbox: (mailbox: Mailbox) => void;
  domain: string;
}

const MailboxSwitcher: React.FC<MailboxSwitcherProps> = ({
  currentMailbox,
  onSwitchMailbox,
  domain,
}) => {
  const { t } = useTranslation();
  const {
    mailboxes,
    deleteMailbox,
    showSuccessMessage,
    showErrorMessage,
  } = useContext(MailboxContext);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSwitchMailbox = (mailbox: Mailbox) => {
    onSwitchMailbox(mailbox);
    setShowDropdown(false);
    showSuccessMessage(t('mailbox.switchSuccess'));
  };

  const handleDeleteMailbox = async (address: string) => {
    if (!window.confirm(t('mailbox.confirmDeleteMailbox'))) {
      return;
    }

    const deleted = await deleteMailbox(address, { silent: true });
    if (!deleted) {
      showErrorMessage(t('mailbox.deleteFailed'));
      return;
    }

    showSuccessMessage(t('mailbox.deleteSavedSuccess'));
  };

  const handleClearAllMailboxes = async () => {
    if (!window.confirm(t('mailbox.confirmClearAllMailboxes'))) {
      return;
    }

    const removableMailboxes = mailboxes.filter((mailbox) => mailbox.address !== currentMailbox.address);
    if (removableMailboxes.length === 0) {
      setShowDropdown(false);
      return;
    }

    const results = await Promise.allSettled(
      removableMailboxes.map((mailbox) => deleteMailbox(mailbox.address, { silent: true })),
    );

    setShowDropdown(false);

    const failedCount = results.filter((result) => result.status === 'rejected' || !result.value).length;
    if (failedCount > 0) {
      showErrorMessage(t('mailbox.clearAllFailed', { count: failedCount }));
      return;
    }

    showSuccessMessage(t('mailbox.clearAllSuccess'));
  };

  if (mailboxes.length <= 1) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setShowDropdown(!showDropdown)}
        className="mr-1 flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-200 hover:bg-primary/20 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        aria-label={t('mailbox.switch') || '切换邮箱'}
        title={t('mailbox.switch') || '切换邮箱'}
      >
        <i className="fas fa-exchange-alt text-sm"></i>
      </button>

      {showDropdown && (
        <div className="absolute left-0 top-9 z-20 min-w-[250px] rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
          <div className="flex items-center justify-between px-2 py-1 text-xs font-medium text-muted-foreground">
            {t('mailbox.savedMailboxes') || '已保存的邮箱'}
            <button
              type="button"
              onClick={handleClearAllMailboxes}
              className="text-xs text-red-500 hover:text-red-700"
              title={t('mailbox.clearAll') || '全部清除'}
            >
              <i className="fas fa-trash-alt mr-1"></i>
              {t('mailbox.clearAll') || '全部清除'}
            </button>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {mailboxes.map((mailbox) => (
              <div key={mailbox.address} className="flex items-center justify-between rounded-sm hover:bg-muted">
                <button
                  type="button"
                  onClick={() => handleSwitchMailbox(mailbox)}
                  className={`w-full truncate px-2 py-1.5 text-left text-sm transition-colors ${
                    mailbox.address === currentMailbox.address ? 'bg-primary/10 font-medium text-primary' : ''
                  }`}
                >
                  {mailbox.address}@{domain}
                </button>
                {mailbox.address !== currentMailbox.address && (
                  <button
                    type="button"
                    onClick={() => handleDeleteMailbox(mailbox.address)}
                    className="p-2 text-red-500 hover:text-red-700"
                    title={t('common.delete') || '删除'}
                  >
                    <i className="fas fa-trash-alt text-xs"></i>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MailboxSwitcher;
