/**
 * 管理 API 路由
 */
import { Hono } from 'hono';
import { AppEnv } from '../types';
import { 
  getAllUsers, 
  createUser, 
  getUserById, 
  updateUser, 
  deleteUser,
  getAllMailboxes,
  getSystemStats 
} from '../database';
import { hashPassword } from '../auth';

const admin = new Hono<AppEnv>();

// 获取所有用户
admin.get('/users', async (c) => {
  try {
    const users = await getAllUsers(c.env.DB);
    
    return c.json({
      success: true,
      users: users.map(u => ({
        id: u.id,
        username: u.username,
        role: u.role,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      }))
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    return c.json({ 
      success: false, 
      error: '获取用户列表失败' 
    }, 500);
  }
});

// 创建用户
admin.post('/users', async (c) => {
  try {
    const body = await c.req.json();
    const { username, password, role } = body;
    
    // 验证参数
    if (!username || !password) {
      return c.json({ 
        success: false, 
        error: '用户名和密码不能为空' 
      }, 400);
    }
    
    if (username.length < 3 || username.length > 20) {
      return c.json({ 
        success: false, 
        error: '用户名长度必须在 3-20 个字符之间' 
      }, 400);
    }
    
    if (password.length < 6) {
      return c.json({ 
        success: false, 
        error: '密码长度至少 6 个字符' 
      }, 400);
    }
    
    const userRole = role === 'admin' ? 'admin' : 'user';
    
    // 创建用户
    const passwordHash = await hashPassword(password);
    const user = await createUser(c.env.DB, username, passwordHash, userRole);
    
    return c.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
      }
    });
  } catch (error: unknown) {
    console.error('创建用户失败:', error);
    
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return c.json({ 
        success: false, 
        error: '用户名已存在' 
      }, 400);
    }
    
    return c.json({ 
      success: false, 
      error: '创建用户失败' 
    }, 500);
  }
});

// 获取单个用户
admin.get('/users/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const user = await getUserById(c.env.DB, id);
    
    if (!user) {
      return c.json({ 
        success: false, 
        error: '用户不存在' 
      }, 404);
    }
    
    return c.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }
    });
  } catch (error) {
    console.error('获取用户信息失败:', error);
    return c.json({ 
      success: false, 
      error: '获取用户信息失败' 
    }, 500);
  }
});

// 更新用户
admin.put('/users/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { username, password, role } = body;
    
    const user = await getUserById(c.env.DB, id);
    if (!user) {
      return c.json({ 
        success: false, 
        error: '用户不存在' 
      }, 404);
    }
    
    // 不能修改管理员数量（至少保留一个管理员）
    if (role === 'user' && user.role === 'admin') {
      const users = await getAllUsers(c.env.DB);
      const adminCount = users.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) {
        return c.json({ 
          success: false, 
          error: '必须保留至少一个管理员' 
        }, 400);
      }
    }
    
    const updates: { username?: string; passwordHash?: string; role?: 'admin' | 'user' } = {};
    
    if (username) {
      if (username.length < 3 || username.length > 20) {
        return c.json({ 
          success: false, 
          error: '用户名长度必须在 3-20 个字符之间' 
        }, 400);
      }
      updates.username = username;
    }
    
    if (password) {
      if (password.length < 6) {
        return c.json({ 
          success: false, 
          error: '密码长度至少 6 个字符' 
        }, 400);
      }
      updates.passwordHash = await hashPassword(password);
    }
    
    if (role && (role === 'admin' || role === 'user')) {
      updates.role = role;
    }
    
    const updatedUser = await updateUser(c.env.DB, id, updates);
    
    return c.json({
      success: true,
      user: {
        id: updatedUser?.id,
        username: updatedUser?.username,
        role: updatedUser?.role,
        updatedAt: updatedUser?.updatedAt,
      }
    });
  } catch (error: unknown) {
    console.error('更新用户失败:', error);
    
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return c.json({ 
        success: false, 
        error: '用户名已存在' 
      }, 400);
    }
    
    return c.json({ 
      success: false, 
      error: '更新用户失败' 
    }, 500);
  }
});

// 删除用户
admin.delete('/users/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const currentUser = c.get('user');
    
    // 不能删除自己
    if (id === currentUser?.sub) {
      return c.json({ 
        success: false, 
        error: '不能删除自己' 
      }, 400);
    }
    
    const user = await getUserById(c.env.DB, id);
    if (!user) {
      return c.json({ 
        success: false, 
        error: '用户不存在' 
      }, 404);
    }
    
    // 不能删除最后一个管理员
    if (user.role === 'admin') {
      const users = await getAllUsers(c.env.DB);
      const adminCount = users.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) {
        return c.json({ 
          success: false, 
          error: '不能删除最后一个管理员' 
        }, 400);
      }
    }
    
    await deleteUser(c.env.DB, id);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('删除用户失败:', error);
    return c.json({ 
      success: false, 
      error: '删除用户失败' 
    }, 500);
  }
});

// 获取所有邮箱（管理员用）
admin.get('/mailboxes', async (c) => {
  try {
    const mailboxes = await getAllMailboxes(c.env.DB);
    
    return c.json({
      success: true,
      mailboxes
    });
  } catch (error) {
    console.error('获取邮箱列表失败:', error);
    return c.json({ 
      success: false, 
      error: '获取邮箱列表失败' 
    }, 500);
  }
});

// 获取系统统计
admin.get('/stats', async (c) => {
  try {
    const stats = await getSystemStats(c.env.DB);
    
    return c.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('获取统计失败:', error);
    return c.json({ 
      success: false, 
      error: '获取统计失败' 
    }, 500);
  }
});

export default admin;
