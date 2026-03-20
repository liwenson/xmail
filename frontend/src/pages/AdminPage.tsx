/**
 * 管理后台页面
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Container from '../components/Container';
import { useAuth } from '../hooks/use-auth';
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  getSystemStats,
  getAllMailboxesAdmin,
} from '../utils/api';

interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
  createdAt: number;
  updatedAt?: number;
}

interface Stats {
  users: number;
  mailboxes: number;
  emails: number;
}

const AdminPage: React.FC = () => {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats>({ users: 0, mailboxes: 0, emails: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({ username: '', password: '', role: 'user' as 'admin' | 'user' });
  const [error, setError] = useState('');

  // 获取用户列表和统计
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [usersResult, statsResult] = await Promise.all([
        getAllUsers(),
        getSystemStats(),
      ]);

      if (usersResult.success && usersResult.users) {
        setUsers(usersResult.users);
      }
      if (statsResult.success && statsResult.stats) {
        setStats(statsResult.stats);
      }
    } catch (err) {
      console.error('获取数据失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // 打开创建/编辑弹窗
  const openModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({ username: user.username, password: '', role: user.role });
    } else {
      setEditingUser(null);
      setFormData({ username: '', password: '', role: 'user' });
    }
    setError('');
    setShowModal(true);
  };

  // 关闭弹窗
  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setFormData({ username: '', password: '', role: 'user' });
    setError('');
  };

  // 提交表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!editingUser && !formData.password) {
      setError('密码不能为空');
      return;
    }

    try {
      if (editingUser) {
        // 更新用户
        const result = await updateUser(editingUser.id, {
          username: formData.username,
          role: formData.role,
          ...(formData.password && { password: formData.password }),
        });

        if (result.success) {
          fetchData();
          closeModal();
        } else {
          setError(result.error || '更新失败');
        }
      } else {
        // 创建用户
        const result = await createUser(formData.username, formData.password, formData.role);

        if (result.success) {
          fetchData();
          closeModal();
        } else {
          setError(result.error || '创建失败');
        }
      }
    } catch (err) {
      setError('操作失败，请稍后重试');
    }
  };

  // 删除用户
  const handleDelete = async (id: string) => {
    if (!window.confirm(t('admin.confirmDelete'))) {
      return;
    }

    try {
      const result = await deleteUser(id);
      if (result.success) {
        fetchData();
      } else {
        alert(result.error || '删除失败');
      }
    } catch (err) {
      alert('删除失败，请稍后重试');
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <Container>
      <div className="space-y-6">
        {/* 标题 */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
          <button
            onClick={() => openModal()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            {t('admin.createUser')}
          </button>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card rounded-lg border p-6">
            <div className="text-3xl font-bold text-primary">{stats.users}</div>
            <div className="text-muted-foreground">{t('admin.totalUsers')}</div>
          </div>
          <div className="bg-card rounded-lg border p-6">
            <div className="text-3xl font-bold text-primary">{stats.mailboxes}</div>
            <div className="text-muted-foreground">{t('admin.totalMailboxes')}</div>
          </div>
          <div className="bg-card rounded-lg border p-6">
            <div className="text-3xl font-bold text-primary">{stats.emails}</div>
            <div className="text-muted-foreground">{t('admin.totalEmails')}</div>
          </div>
        </div>

        {/* 用户列表 */}
        <div className="bg-card rounded-lg border">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">{t('admin.userManagement')}</h2>
          </div>
          
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium">{t('admin.username')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">{t('admin.role')}</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">{t('admin.createdAt')}</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {user.username}
                          {user.id === currentUser?.id && (
                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                              {t('admin.you')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs ${
                          user.role === 'admin' 
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                        }`}>
                          {user.role === 'admin' ? t('admin.admin') : t('admin.user')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openModal(user)}
                          className="text-primary hover:text-primary/80 mr-3"
                        >
                          {t('common.edit')}
                        </button>
                        {user.id !== currentUser?.id && (
                          <button
                            onClick={() => handleDelete(user.id)}
                            className="text-destructive hover:text-destructive/80"
                          >
                            {t('common.delete')}
                          </button>
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

      {/* 创建/编辑用户弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg border shadow-lg w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">
              {editingUser ? t('admin.editUser') : t('admin.createUser')}
            </h2>

            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('auth.username')}</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  minLength={3}
                  maxLength={20}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  {t('auth.password')}
                  {editingUser && <span className="text-muted-foreground ml-1">({t('admin.leaveEmpty')})</span>}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  minLength={6}
                  required={!editingUser}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">{t('admin.role')}</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'user' })}
                  className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="user">{t('admin.user')}</option>
                  <option value="admin">{t('admin.admin')}</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 border rounded-md hover:bg-muted transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  {editingUser ? t('common.save') : t('admin.createUser')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Container>
  );
};

export default AdminPage;
