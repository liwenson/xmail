import { API_BASE_URL } from "../config";

// API请求基础URL
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;

// JWT Token 管理
const TOKEN_KEY = 'xmail_auth_token';

export const getToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

export const setToken = (token: string): void => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const removeToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
};

// 获取认证 headers
const getAuthHeaders = (): Record<string, string> => {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

// 获取认证用户信息
export const getCurrentUser = async () => {
  try {
    const response = await fetch(apiUrl('/api/auth/me'), {
      headers: getAuthHeaders(),
    });
    const data = await response.json();
    
    if (data.success && data.user) {
      return { success: true, user: data.user };
    } else {
      return { success: false, error: data.error };
    }
  } catch (error) {
    console.error('获取用户信息失败:', error);
    return { success: false, error };
  }
};

// 检查是否需要初始化
export const checkNeedsSetup = async () => {
  try {
    const response = await fetch(apiUrl('/api/auth/setup'));
    const data = await response.json();
    return { success: true, needsSetup: data.needsSetup };
  } catch (error) {
    console.error('检查初始化状态失败:', error);
    return { success: false, error };
  }
};

// 创建管理员
export const setupAdmin = async (username: string, password: string) => {
  try {
    const response = await fetch(apiUrl('/api/auth/setup'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    
    const data = await response.json();
    
    if (data.success && data.token) {
      setToken(data.token);
      return { success: true, user: data.user };
    } else {
      return { success: false, error: data.error || '创建失败' };
    }
  } catch (error) {
    console.error('创建管理员失败:', error);
    return { success: false, error };
  }
};

// 登录
export const login = async (username: string, password: string) => {
  try {
    const response = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    
    const data = await response.json();
    
    if (data.success && data.token) {
      setToken(data.token);
      return { success: true, user: data.user };
    } else {
      return { success: false, error: data.error || '登录失败' };
    }
  } catch (error) {
    console.error('登录失败:', error);
    return { success: false, error };
  }
};

// 登出
export const logout = async () => {
  removeToken();
  return { success: true };
};

// 获取用户的邮箱列表
export const getMailboxes = async () => {
  try {
    const response = await fetch(apiUrl('/api/mailboxes'), {
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: '未登录', unauthorized: true };
      }
      throw new Error('获取邮箱列表失败');
    }
    
    const data = await response.json();
    
    if (data.success) {
      return { success: true, mailboxes: data.mailboxes };
    } else {
      return { success: false, error: data.error };
    }
  } catch (error) {
    console.error('获取邮箱列表失败:', error);
    return { success: false, error };
  }
};

// 创建随机邮箱
export const createRandomMailbox = async (expiresInHours = 24) => {
  try {
    const response = await fetch(apiUrl('/api/mailboxes'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ expiresInHours }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.error || '创建邮箱失败' };
    }
    
    if (data.success) {
      return { success: true, mailbox: data.mailbox };
    } else {
      return { success: false, error: data.error || '创建失败' };
    }
  } catch (error) {
    console.error('创建邮箱失败:', error);
    return { success: false, error };
  }
};

// 创建自定义邮箱
export const createCustomMailbox = async (address: string, expiresInHours = 24) => {
  try {
    if (!address.trim()) {
      return { success: false, error: '地址不能为空' };
    }
    
    const response = await fetch(apiUrl('/api/mailboxes'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        address: address.trim(),
        expiresInHours,
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.error || '创建失败' };
    }
    
    if (data.success) {
      return { success: true, mailbox: data.mailbox };
    } else {
      return { success: false, error: data.error || '创建失败' };
    }
  } catch (error) {
    console.error('创建自定义邮箱失败:', error);
    return { success: false, error };
  }
};

// 获取邮箱信息
export const getMailbox = async (address: string) => {
  try {
    const response = await fetch(apiUrl(`/api/mailboxes/${address}`), {
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: '邮箱不存在' };
      }
      throw new Error('获取邮箱失败');
    }
    
    const data = await response.json();
    if (data.success) {
      return { success: true, mailbox: data.mailbox };
    } else {
      return { success: false, error: data.error };
    }
  } catch (error) {
    console.error('获取邮箱失败:', error);
    return { success: false, error };
  }
};

// 获取邮件列表
export const getEmails = async (address: string) => {
  try {
    if (!address) {
      return { success: false, error: '地址为空', emails: [] };
    }
    
    const response = await fetch(apiUrl(`/api/mailboxes/${address}/emails`), {
      headers: getAuthHeaders(),
    });
    
    if (response.status === 404) {
      return { success: false, error: '邮箱不存在', notFound: true };
    }
    
    if (!response.ok) {
      throw new Error(`获取邮件失败: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      return { success: true, emails: data.emails };
    } else {
      if (data.error?.includes('邮箱不存在')) {
        return { success: false, error: data.error, notFound: true };
      }
      return { success: false, error: data.error };
    }
  } catch (error) {
    console.error('获取邮件失败:', error);
    return { success: false, error, emails: [] };
  }
};

// 删除邮箱
export const deleteMailbox = async (address: string) => {
  try {
    const response = await fetch(apiUrl(`/api/mailboxes/${address}`), {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      throw new Error('删除失败');
    }
    
    const data = await response.json();
    if (data.success) {
      return { success: true };
    } else {
      return { success: false, error: data.error };
    }
  } catch (error) {
    console.error('删除邮箱失败:', error);
    return { success: false, error };
  }
};

// ============ 管理 API =============

// 获取所有用户（管理员）
export const getAllUsers = async () => {
  try {
    const response = await fetch(apiUrl('/api/admin/users'), {
      headers: getAuthHeaders(),
    });
    
    const data = await response.json();
    
    if (data.success) {
      return { success: true, users: data.users };
    } else {
      return { success: false, error: data.error };
    }
  } catch (error) {
    console.error('获取用户列表失败:', error);
    return { success: false, error };
  }
};

// 创建用户（管理员）
export const createUser = async (username: string, password: string, role: 'admin' | 'user' = 'user') => {
  try {
    const response = await fetch(apiUrl('/api/admin/users'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ username, password, role }),
    });
    
    const data = await response.json();
    
    if (data.success) {
      return { success: true, user: data.user };
    } else {
      return { success: false, error: data.error };
    }
  } catch (error) {
    console.error('创建用户失败:', error);
    return { success: false, error };
  }
};

// 更新用户（管理员）
export const updateUser = async (id: string, updates: { username?: string; password?: string; role?: 'admin' | 'user' }) => {
  try {
    const response = await fetch(apiUrl(`/api/admin/users/${id}`), {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    });
    
    const data = await response.json();
    
    if (data.success) {
      return { success: true, user: data.user };
    } else {
      return { success: false, error: data.error };
    }
  } catch (error) {
    console.error('更新用户失败:', error);
    return { success: false, error };
  }
};

// 删除用户（管理员）
export const deleteUser = async (id: string) => {
  try {
    const response = await fetch(apiUrl(`/api/admin/users/${id}`), {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    
    const data = await response.json();
    
    if (data.success) {
      return { success: true };
    } else {
      return { success: false, error: data.error };
    }
  } catch (error) {
    console.error('删除用户失败:', error);
    return { success: false, error };
  }
};

// 获取系统统计（管理员）
export const getSystemStats = async () => {
  try {
    const response = await fetch(apiUrl('/api/admin/stats'), {
      headers: getAuthHeaders(),
    });
    
    const data = await response.json();
    
    if (data.success) {
      return { success: true, stats: data.stats };
    } else {
      return { success: false, error: data.error };
    }
  } catch (error) {
    console.error('获取统计失败:', error);
    return { success: false, error };
  }
};

// 获取所有邮箱（管理员）
export const getAllMailboxesAdmin = async () => {
  try {
    const response = await fetch(apiUrl('/api/admin/mailboxes'), {
      headers: getAuthHeaders(),
    });
    
    const data = await response.json();
    
    if (data.success) {
      return { success: true, mailboxes: data.mailboxes };
    } else {
      return { success: false, error: data.error };
    }
  } catch (error) {
    console.error('获取邮箱列表失败:', error);
    return { success: false, error };
  }
};

// ============ 本地存储（用于邮箱切换）============

// 保存邮箱信息到本地存储
export const saveMailboxToLocalStorage = (mailbox: Mailbox) => {
  try {
    const mailboxes = getMailboxesFromLocalStorage();
    const index = mailboxes.findIndex(m => m.address === mailbox.address);
    
    if (index >= 0) {
      mailboxes[index] = mailbox;
    } else {
      mailboxes.push(mailbox);
    }
    
    localStorage.setItem('xmail_mailboxes', JSON.stringify(mailboxes));
    localStorage.setItem('xmail_current_mailbox', mailbox.address);
  } catch (error) {
    console.error('保存邮箱失败:', error);
  }
};

// 从本地存储获取邮箱列表
export const getMailboxesFromLocalStorage = (): Mailbox[] => {
  try {
    const data = localStorage.getItem('xmail_mailboxes');
    if (!data) return [];
    
    const mailboxes = JSON.parse(data) as Mailbox[];
    const now = Date.now() / 1000;
    
    // 过滤掉过期的邮箱
    return mailboxes.filter(m => m.expiresAt > now);
  } catch {
    return [];
  }
};

// 从本地存储获取当前邮箱
export const getCurrentMailboxFromLocalStorage = (): Mailbox | null => {
  try {
    const address = localStorage.getItem('xmail_current_mailbox');
    if (!address) return null;
    
    const mailboxes = getMailboxesFromLocalStorage();
    const mailbox = mailboxes.find(m => m.address === address);
    
    if (!mailbox || mailbox.expiresAt < Date.now() / 1000) {
      localStorage.removeItem('xmail_current_mailbox');
      return null;
    }
    
    return mailbox;
  } catch {
    return null;
  }
};

// 删除本地存储中的邮箱
export const removeMailboxFromLocalStorage = (address: string) => {
  try {
    const mailboxes = getMailboxesFromLocalStorage();
    const filtered = mailboxes.filter(m => m.address !== address);
    
    localStorage.setItem('xmail_mailboxes', JSON.stringify(filtered));
    
    // 如果删除的是当前邮箱，清除当前邮箱
    const current = localStorage.getItem('xmail_current_mailbox');
    if (current === address) {
      localStorage.removeItem('xmail_current_mailbox');
    }
  } catch (error) {
    console.error('删除邮箱失败:', error);
  }
};

// 清除所有本地邮箱
export const clearAllMailboxesFromLocalStorage = () => {
  localStorage.removeItem('xmail_mailboxes');
  localStorage.removeItem('xmail_current_mailbox');
};
