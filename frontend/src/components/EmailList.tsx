import React, { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MailboxContext } from '../contexts/MailboxContext';
import EmailDetail from './EmailDetail';

interface EmailListProps {
  emails: Email[];
  selectedEmailId: string | null;
  onSelectEmail: (id: string | null) => void;
  isLoading: boolean;
}

const EmailList: React.FC<EmailListProps> = ({ 
  emails, 
  selectedEmailId, 
  onSelectEmail,
  isLoading 
}) => {
  const { t } = useTranslation();
  const { autoRefresh, setAutoRefresh, refreshEmails, currentMailbox: mailbox, deleteMailbox } = useContext(MailboxContext);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };
  
  const formatFullDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };
  
  const calculateTimeLeft = (expiresAt: number) => {
    if (!expiresAt) return '';
    
    const now = Math.floor(Date.now() / 1000);
    const timeLeftSeconds = expiresAt - now;
    
    if (timeLeftSeconds <= 0) {
      return t('mailbox.expired');
    }
    
    const hours = Math.floor(timeLeftSeconds / 3600);
    const minutes = Math.floor((timeLeftSeconds % 3600) / 60);
    
    if (hours > 0) {
      return t('mailbox.expiresInTime', { hours, minutes });
    } else {
      return t('mailbox.expiresInMinutes', { minutes });
    }
  };
  
  const handleRefresh = () => {
    // feat: 调用 context 中的 refreshEmails，并传入 true 表示是手动刷新
    refreshEmails(true);
  };
  
  const toggleAutoRefresh = () => {
    setAutoRefresh(!autoRefresh);
  };
  
  const handleDeleteMailbox = async () => {
    if (!mailbox) return;
    if (window.confirm(t('mailbox.confirmDelete'))) {
      setIsDeleting(true);
      try {
        await deleteMailbox(mailbox.address);
      } catch (error) {
        console.error('Error deleting mailbox:', error);
      } finally {
        setIsDeleting(false);
      }
    }
  };
  
  if (isLoading || isDeleting) {
    return (
      <div className="border rounded-lg shadow-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">{t('email.inbox')}</h2>
        </div>
        <div className="flex flex-col justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-2 text-sm text-muted-foreground">{t('common.loading')}...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="border rounded-lg shadow-sm">
      <div className="flex justify-between items-center p-4 border-b">
        <h2 className="text-lg font-semibold">{t('email.inbox')}</h2>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleRefresh}
            className="p-2 rounded-lg hover:bg-muted/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            title={t('email.refresh')}
          >
            <i className={`fas fa-sync-alt text-sm transition-transform duration-300 ${isLoading || isDeleting ? 'animate-spin' : ''}`}></i>
          </button>
          <button
            type="button"
            onClick={toggleAutoRefresh}
            className={`p-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${autoRefresh ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:bg-muted/80'}`}
            title={autoRefresh ? t('email.autoRefreshOn') : t('email.autoRefreshOff')}
          >
            <i className="fas fa-clock text-sm"></i>
          </button>
        </div>
      </div>
      
      {mailbox && (
        <div className="px-4 py-3 bg-gradient-to-r from-muted/40 to-muted/20 border-b text-xs text-muted-foreground">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            <div className="flex justify-between sm:justify-start sm:gap-2">
              <span className="text-muted-foreground/70">{t('mailbox.created')}:</span>
              <span className="font-medium text-foreground/80">{formatFullDate(mailbox.createdAt)}</span>
            </div>
            <div className="flex justify-between sm:justify-start sm:gap-2">
              <span className="text-muted-foreground/70">{t('mailbox.expiresAt')}:</span>
              <span className="font-medium text-foreground/80">{formatFullDate(mailbox.expiresAt)}</span>
            </div>
            <div className="flex justify-between sm:justify-start sm:gap-2">
              <span className="text-muted-foreground/70">{t('mailbox.timeLeft')}:</span>
              <span className="font-medium text-foreground/80">{calculateTimeLeft(mailbox.expiresAt)}</span>
            </div>
          </div>
          <div className="flex justify-end mt-2">
            <button
              type="button"
              onClick={handleDeleteMailbox}
              className="text-red-500 hover:text-red-600 text-xs sm:text-sm flex items-center gap-1.5 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              title={t('mailbox.delete')}
            >
              <i className="fas fa-trash-alt"></i>
              <span>{t('mailbox.delete')}</span>
            </button>
          </div>
        </div>
      )}
      
      <div className="flex justify-between items-center px-4 py-2 bg-muted/30">
        <span className="text-sm text-muted-foreground">
          {emails.length} {emails.length === 1 ? t('email.message') : t('email.messages')}
        </span>
        <span className="text-xs text-muted-foreground">
          {autoRefresh ? t('email.autoRefreshOn') : t('email.autoRefreshOff')}
        </span>
      </div>
      
      {emails.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
            <i className="fas fa-inbox text-2xl text-muted-foreground/70"></i>
          </div>
          <p className="font-medium">{t('email.emptyInbox')}</p>
          <p className="text-sm mt-1.5 max-w-xs mx-auto">{t('email.waitingForEmails')}</p>
        </div>
      ) : (
        <ul className="divide-y">
          {emails.map((email) => (
            <React.Fragment key={email.id}>
              <li>
                <button
                  type="button"
                  className={`w-full p-4 text-left transition-all duration-200 hover:bg-muted/60 hover:pl-5 active:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${
                    selectedEmailId === email.id ? 'bg-primary/5 border-l-2 border-l-primary pl-[calc(1rem-2px)]' : 'border-l-2 border-l-transparent'
                  } ${!email.isRead ? 'font-semibold' : ''}`}
                  onClick={() => onSelectEmail(selectedEmailId === email.id ? null : email.id)}
                >
                  <div className="flex justify-between mb-1">
                    <span className="truncate">{email.fromName || email.fromAddress}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                      {formatDate(email.receivedAt)}
                    </span>
                  </div>
                  <div className="text-sm truncate">
                    {email.subject || t('email.noSubject')}
                  </div>
                </button>
              </li>
              {selectedEmailId === email.id && (
                <li className="border-t border-muted">
                  <EmailDetail 
                    emailId={email.id} 
                    onClose={() => onSelectEmail(null)}
                  />
                </li>
              )}
            </React.Fragment>
          ))}
        </ul>
      )}
    </div>
  );
};

export default EmailList; 
