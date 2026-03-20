/**
 * 邮箱状态管理
 */
import React, { createContext, useState, useEffect, useCallback, ReactNode, useContext } from 'react';
import { useAuthContext } from '../contexts/AuthContext';
import {
  getMailboxes,
  createRandomMailbox,
  createCustomMailbox,
  getMailbox,
  getEmails,
  deleteMailbox as apiDeleteMailbox,
  getMailboxesFromLocalStorage,
  getCurrentMailboxFromLocalStorage,
  saveMailboxToLocalStorage,
  removeMailboxFromLocalStorage,
} from '../utils/api';
import { DEFAULT_AUTO_REFRESH, AUTO_REFRESH_INTERVAL } from '../config';

// 邮件详情缓存接口
interface EmailCache {
  [emailId: string]: {
    email: Email;
    attachments: any[];
    timestamp: number;
  }
}

interface MailboxContextType {
  mailboxes: Mailbox[];
  currentMailbox: Mailbox | null;
  setCurrentMailbox: (mailbox: Mailbox | null) => void;
  isLoading: boolean;
  emails: Email[];
  setEmails: (emails: Email[]) => void;
  selectedEmail: string | null;
  setSelectedEmail: (id: string | null) => void;
  isEmailsLoading: boolean;
  setIsEmailsLoading: (loading: boolean) => void;
  autoRefresh: boolean;
  setAutoRefresh: (autoRefresh: boolean) => void;
  createNewMailbox: () => Promise<void>;
  createCustomMailbox: (address: string) => Promise<void>;
  deleteMailbox: (address: string) => Promise<void>;
  refreshEmails: (isManual?: boolean) => Promise<void>;
  emailCache: EmailCache;
  addToEmailCache: (emailId: string, email: Email, attachments: any[]) => void;
  clearEmailCache: () => void;
  errorMessage: string | null;
  successMessage: string | null;
  showSuccessMessage: (message: string) => void;
  showErrorMessage: (message: string) => void;
}

export const MailboxContext = createContext<MailboxContextType>({
  mailboxes: [],
  currentMailbox: null,
  setCurrentMailbox: () => {},
  isLoading: true,
  emails: [],
  setEmails: () => {},
  selectedEmail: null,
  setSelectedEmail: () => {},
  isEmailsLoading: false,
  setIsEmailsLoading: () => {},
  autoRefresh: DEFAULT_AUTO_REFRESH,
  setAutoRefresh: () => {},
  createNewMailbox: async () => {},
  createCustomMailbox: async () => {},
  deleteMailbox: async () => {},
  refreshEmails: async () => {},
  emailCache: {},
  addToEmailCache: () => {},
  clearEmailCache: () => {},
  errorMessage: null,
  successMessage: null,
  showSuccessMessage: () => {},
  showErrorMessage: () => {},
});

interface MailboxProviderProps {
  children: ReactNode;
}

export const MailboxProvider: React.FC<MailboxProviderProps> = ({ children }) => {
  const { isAuthenticated, user } = useAuthContext();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [currentMailbox, setCurrentMailboxState] = useState<Mailbox | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [isEmailsLoading, setIsEmailsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(DEFAULT_AUTO_REFRESH);
  const [emailCache, setEmailCache] = useState<EmailCache>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const errorTimeoutRef = React.useRef<number | null>(null);
  const successTimeoutRef = React.useRef<number | null>(null);

  // 显示成功消息
  const showSuccessMessage = useCallback((message: string) => {
    setSuccessMessage(message);
    if (successTimeoutRef.current) {
      window.clearTimeout(successTimeoutRef.current);
    }
    successTimeoutRef.current = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 3000);
  }, []);

  // 显示错误消息
  const showErrorMessage = useCallback((message: string) => {
    setErrorMessage(message);
    if (errorTimeoutRef.current) {
      window.clearTimeout(errorTimeoutRef.current);
    }
    errorTimeoutRef.current = window.setTimeout(() => {
      setErrorMessage(null);
    }, 3000);
  }, []);

  // 清除提示的定时器
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) {
        window.clearTimeout(errorTimeoutRef.current);
      }
      if (successTimeoutRef.current) {
        window.clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  // 设置当前邮箱
  const setCurrentMailbox = useCallback((mailbox: Mailbox | null) => {
    setCurrentMailboxState(mailbox);
    if (mailbox) {
      saveMailboxToLocalStorage(mailbox);
    }
    setSelectedEmail(null);
    setEmails([]);
    setEmailCache({});
  }, []);

  // 从服务器获取邮箱列表
  const fetchMailboxes = useCallback(async () => {
    const result = await getMailboxes();
    if (result.success && result.mailboxes) {
      setMailboxes(result.mailboxes);
      return result.mailboxes;
    }
    return [];
  }, []);

  // 初始化邮箱
  const initMailboxes = useCallback(async () => {
    if (!isAuthenticated) {
      setMailboxes([]);
      setCurrentMailboxState(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // 先从服务器获取
      const serverMailboxes = await fetchMailboxes();
      
      // 尝试使用服务器数据
      if (serverMailboxes.length > 0) {
        const current = getCurrentMailboxFromLocalStorage();
        const validCurrent = serverMailboxes.find(m => m.address === current?.address);
        
        if (validCurrent) {
          setCurrentMailboxState(validCurrent);
        } else {
          setCurrentMailboxState(serverMailboxes[0]);
        }
      }
    } catch (error) {
      console.error('初始化邮箱失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, fetchMailboxes]);

  // 监听认证状态变化
  useEffect(() => {
    initMailboxes();
  }, [initMailboxes]);

  // 创建新邮箱
  const createNewMailbox = useCallback(async () => {
    try {
      setErrorMessage(null);
      setSuccessMessage(null);
      
      const result = await createRandomMailbox();
      if (result.success && result.mailbox) {
        setMailboxes(prev => [...prev, result.mailbox!]);
        setCurrentMailbox(result.mailbox);
        showSuccessMessage('邮箱创建成功');
      } else {
        showErrorMessage(result.error || '创建邮箱失败');
      }
    } catch (error) {
      console.error('创建邮箱失败:', error);
      showErrorMessage('创建邮箱失败');
    }
  }, [setCurrentMailbox, showSuccessMessage, showErrorMessage]);

  // 创建自定义邮箱
  const createCustomMailboxFn = useCallback(async (address: string) => {
    try {
      setErrorMessage(null);
      setSuccessMessage(null);
      
      const result = await createCustomMailbox(address);
      if (result.success && result.mailbox) {
        setMailboxes(prev => [...prev, result.mailbox!]);
        setCurrentMailbox(result.mailbox);
        showSuccessMessage('邮箱创建成功');
      } else {
        showErrorMessage(result.error || '创建邮箱失败');
      }
    } catch (error) {
      console.error('创建邮箱失败:', error);
      showErrorMessage('创建邮箱失败');
    }
  }, [setCurrentMailbox, showSuccessMessage, showErrorMessage]);

  // 删除邮箱
  const deleteMailboxFn = useCallback(async (address: string) => {
    try {
      setErrorMessage(null);
      setSuccessMessage(null);
      
      const result = await apiDeleteMailbox(address);
      if (result.success) {
        setMailboxes(prev => prev.filter(m => m.address !== address));
        removeMailboxFromLocalStorage(address);
        
        if (currentMailbox?.address === address) {
          const remaining = mailboxes.filter(m => m.address !== address);
          if (remaining.length > 0) {
            setCurrentMailbox(remaining[0]);
          } else {
            setCurrentMailboxState(null);
          }
        }
        
        showSuccessMessage('邮箱删除成功');
      } else {
        showErrorMessage(result.error || '删除邮箱失败');
      }
    } catch (error) {
      console.error('删除邮箱失败:', error);
      showErrorMessage('删除邮箱失败');
    }
  }, [currentMailbox, mailboxes, setCurrentMailbox, showSuccessMessage, showErrorMessage]);

  // 刷新邮件
  const refreshEmails = useCallback(async (isManual = false) => {
    if (!currentMailbox || isEmailsLoading) return;
    setIsEmailsLoading(true);

    try {
      const result = await getEmails(currentMailbox.address);

      if (result.success) {
        setEmails(result.emails || []);
        if (isManual) {
          showSuccessMessage('邮件列表已刷新');
        }
      } else if (result.notFound) {
        showErrorMessage('邮箱不存在');
      } else {
        if (isManual) {
          showErrorMessage(result.error || '获取邮件失败');
        }
      }
    } catch (error) {
      console.error('获取邮件失败:', error);
      if (isManual) {
        showErrorMessage('获取邮件失败');
      }
    } finally {
      setIsEmailsLoading(false);
    }
  }, [currentMailbox, isEmailsLoading, showSuccessMessage, showErrorMessage]);

  // 自动刷新邮件
  useEffect(() => {
    if (!currentMailbox || isLoading || !isAuthenticated) return;
    
    refreshEmails();
    let intervalId: number | undefined;
    
    if (autoRefresh) {
      intervalId = window.setInterval(() => refreshEmails(), AUTO_REFRESH_INTERVAL);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [currentMailbox, autoRefresh, isLoading, isAuthenticated, refreshEmails]);

  // 添加邮件到缓存
  const addToEmailCache = useCallback((emailId: string, email: Email, attachments: any[]) => {
    setEmailCache(prev => ({
      ...prev,
      [emailId]: {
        email,
        attachments,
        timestamp: Date.now()
      }
    }));
  }, []);

  // 清除邮件缓存
  const clearEmailCache = useCallback(() => {
    setEmailCache({});
  }, []);

  return (
    <MailboxContext.Provider
      value={{
        mailboxes,
        currentMailbox,
        setCurrentMailbox,
        isLoading,
        emails,
        setEmails,
        selectedEmail,
        setSelectedEmail,
        isEmailsLoading,
        setIsEmailsLoading,
        autoRefresh,
        setAutoRefresh,
        createNewMailbox,
        createCustomMailbox: createCustomMailboxFn,
        deleteMailbox: deleteMailboxFn,
        refreshEmails,
        emailCache,
        addToEmailCache,
        clearEmailCache,
        errorMessage,
        successMessage,
        showSuccessMessage,
        showErrorMessage,
      }}
    >
      {/* 全局通知组件 */}
      {(errorMessage || successMessage) && (
        <div
          className={`fixed bottom-4 right-4 z-50 p-3 rounded-md shadow-lg max-w-md ${
            errorMessage
              ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
              : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
          }`}
        >
          {errorMessage || successMessage}
        </div>
      )}
      {children}
    </MailboxContext.Provider>
  );
};

// 便捷 Hook
export const useMailbox = () => useContext(MailboxContext);
