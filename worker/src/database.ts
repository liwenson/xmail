import { D1Database } from '@cloudflare/workers-types';
import { 
  User,
  UserSession,
  ApiToken,
  CreateApiTokenParams,
  Mailbox, 
  CreateMailboxParams, 
  Email, 
  SaveEmailParams, 
  EmailListItem,
  Attachment,
  AttachmentListItem,
  SaveAttachmentParams
} from './types';
import { 
  generateId, 
  getCurrentTimestamp, 
  calculateExpiryTimestamp 
} from './utils';
import { hashPassword } from './auth/password';

// 附件分块大小（字节）
const CHUNK_SIZE = 500000; // 约500KB

// 默认管理员账号配置
const DEFAULT_ADMIN = {
  username: 'admin',
  password: 'admin123'
};

const DATABASE_INITIALIZED_KEY = 'database_initialized';
const ADMIN_INITIALIZED_KEY = 'admin_initialized';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hashApiTokenValue(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return bytesToHex(new Uint8Array(digest));
}

function generateApiTokenValue(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(24));
  return `xmail_tok_${bytesToBase64Url(randomBytes)}`;
}

async function setSystemSetting(db: D1Database, key: string, value: string): Promise<void> {
  const now = getCurrentTimestamp();
  await db.prepare(`INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)`)
    .bind(key, value, now)
    .run();
}

async function getSystemSetting(db: D1Database, key: string): Promise<string | null> {
  const result = await db.prepare(`SELECT value FROM system_settings WHERE key = ?`).bind(key).first();
  return (result?.value as string | undefined) ?? null;
}

function isSettingEnabled(value: string | null): boolean {
  return value === 'true';
}

/**
 * 初始化数据库
 * @param db 数据库实例
 */
export async function initializeDatabase(db: D1Database): Promise<void> {
  try {
    // 检查用户表是否存在
    const existingTables = await db.prepare('SELECT name FROM sqlite_master WHERE type=? AND name=?').bind('table', 'users').first();
    
    if (!existingTables) {
      console.log('开始创建数据库表...');
      
      // 创建用户表
      await db.prepare('CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT "user", created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)').run();
      
      // 创建会话表
      await db.prepare('CREATE TABLE user_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)').run();

      // 创建 API Token 表
      await db.prepare('CREATE TABLE api_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER, last_used_at INTEGER, revoked_at INTEGER)').run();
      
      // 创建邮箱表
      await db.prepare('CREATE TABLE mailboxes (id TEXT PRIMARY KEY, address TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, ip_address TEXT, last_accessed INTEGER NOT NULL, user_id TEXT)').run();
      
      // 创建邮件表
      await db.prepare('CREATE TABLE emails (id TEXT PRIMARY KEY, mailbox_id TEXT NOT NULL, from_address TEXT NOT NULL, from_name TEXT, to_address TEXT NOT NULL, subject TEXT, text_content TEXT, html_content TEXT, received_at INTEGER NOT NULL, has_attachments INTEGER DEFAULT 0, is_read INTEGER DEFAULT 0)').run();
      
      // 创建附件表
      await db.prepare('CREATE TABLE attachments (id TEXT PRIMARY KEY, email_id TEXT NOT NULL, filename TEXT NOT NULL, mime_type TEXT NOT NULL, content TEXT, size INTEGER NOT NULL, created_at INTEGER NOT NULL, is_large INTEGER DEFAULT 0, chunks_count INTEGER DEFAULT 0)').run();
      
      // 创建附件块表
      await db.prepare('CREATE TABLE attachment_chunks (id TEXT PRIMARY KEY, attachment_id TEXT NOT NULL, chunk_index INTEGER NOT NULL, content TEXT NOT NULL)').run();

      // 创建系统设置表
      await db.prepare('CREATE TABLE system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)').run();
      
      // 创建索引
      await db.prepare('CREATE INDEX idx_users_username ON users(username)').run();
      await db.prepare('CREATE INDEX idx_sessions_user_id ON user_sessions(user_id)').run();
      await db.prepare('CREATE INDEX idx_api_tokens_user_id ON api_tokens(user_id)').run();
      await db.prepare('CREATE INDEX idx_api_tokens_hash ON api_tokens(token_hash)').run();
      await db.prepare('CREATE INDEX idx_mailboxes_address ON mailboxes(address)').run();
      await db.prepare('CREATE INDEX idx_mailboxes_expires_at ON mailboxes(expires_at)').run();
      await db.prepare('CREATE INDEX idx_mailboxes_user_id ON mailboxes(user_id)').run();
      await db.prepare('CREATE INDEX idx_emails_mailbox_id ON emails(mailbox_id)').run();
      await db.prepare('CREATE INDEX idx_emails_received_at ON emails(received_at)').run();
      await db.prepare('CREATE INDEX idx_attachments_email_id ON attachments(email_id)').run();
      await db.prepare('CREATE INDEX idx_attachment_chunks_attachment_id ON attachment_chunks(attachment_id)').run();
      await db.prepare('CREATE INDEX idx_attachment_chunks_chunk_index ON attachment_chunks(chunk_index)').run();
      
      console.log('数据库表创建成功');
    }

    await db.prepare('CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)').run();
    await db.prepare('CREATE TABLE IF NOT EXISTS api_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, expires_at INTEGER, last_used_at INTEGER, revoked_at INTEGER)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens(user_id)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash)').run();
    await setSystemSetting(db, DATABASE_INITIALIZED_KEY, 'true');
    
    // 检查管理员是否存在
    const adminCount = await db.prepare('SELECT COUNT(*) as count FROM users WHERE role=?').bind('admin').first();
    
    // 如果没有管理员，创建默认管理员
    if (!adminCount || (adminCount.count as number) === 0) {
      console.log('创建默认管理员账号...');
      const now = getCurrentTimestamp();
      const passwordHash = await hashPassword(DEFAULT_ADMIN.password);
      await db.prepare('INSERT INTO users (id, username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(generateId(), DEFAULT_ADMIN.username, passwordHash, 'admin', now, now)
        .run();
      console.log(`默认管理员账号已创建: ${DEFAULT_ADMIN.username} / ${DEFAULT_ADMIN.password}`);
    } else {
      console.log('管理员账号已存在，跳过创建');
    }

    await setSystemSetting(db, ADMIN_INITIALIZED_KEY, 'true');
    
    console.log('数据库初始化成功');
  } catch (error) {
    console.error('数据库初始化失败:', error);
    throw error;
  }
}

export async function isDatabaseInitialized(db: D1Database): Promise<boolean> {
  return isSettingEnabled(await getSystemSetting(db, DATABASE_INITIALIZED_KEY));
}

export async function isAdminInitialized(db: D1Database): Promise<boolean> {
  return isSettingEnabled(await getSystemSetting(db, ADMIN_INITIALIZED_KEY));
}

export async function markAdminInitialized(db: D1Database): Promise<void> {
  await setSystemSetting(db, ADMIN_INITIALIZED_KEY, 'true');
}

/**
 * 创建邮箱
 * @param db 数据库实例
 * @param params 参数
 * @returns 创建的邮箱
 */
export async function createMailbox(db: D1Database, params: CreateMailboxParams): Promise<Mailbox> {
  const now = getCurrentTimestamp();
  const mailbox: Mailbox = {
    id: generateId(),
    address: params.address,
    createdAt: now,
    expiresAt: calculateExpiryTimestamp(params.expiresInHours),
    ipAddress: params.ipAddress,
    lastAccessed: now,
    userId: params.userId,
  };
  
  await db.prepare(`INSERT INTO mailboxes (id, address, created_at, expires_at, ip_address, last_accessed, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(mailbox.id, mailbox.address, mailbox.createdAt, mailbox.expiresAt, mailbox.ipAddress, mailbox.lastAccessed, mailbox.userId || null)
    .run();
  
  return mailbox;
}

/**
 * 获取邮箱信息
 * @param db 数据库实例
 * @param address 邮箱地址
 * @returns 邮箱信息
 */
export async function getMailbox(db: D1Database, address: string): Promise<Mailbox | null> {
  const now = getCurrentTimestamp();
  const result = await db.prepare(`SELECT id, address, created_at, expires_at, ip_address, last_accessed, user_id FROM mailboxes WHERE address = ? AND expires_at > ?`).bind(address, now).first();
  
  if (!result) return null;
  
  // 更新最后访问时间
  await db.prepare(`UPDATE mailboxes SET last_accessed = ? WHERE id = ?`).bind(now, result.id).run();
  
  return {
    id: result.id as string,
    address: result.address as string,
    createdAt: result.created_at as number,
    expiresAt: result.expires_at as number,
    ipAddress: result.ip_address as string,
    lastAccessed: now,
    userId: result.user_id as string | undefined,
  };
}

/**
 * 根据邮箱ID获取邮箱信息
 * @param db 数据库实例
 * @param id 邮箱ID
 * @returns 邮箱信息
 */
export async function getMailboxById(db: D1Database, id: string): Promise<Mailbox | null> {
  const result = await db.prepare(`SELECT id, address, created_at, expires_at, ip_address, last_accessed, user_id FROM mailboxes WHERE id = ?`).bind(id).first();

  if (!result) return null;

  return {
    id: result.id as string,
    address: result.address as string,
    createdAt: result.created_at as number,
    expiresAt: result.expires_at as number,
    ipAddress: result.ip_address as string,
    lastAccessed: result.last_accessed as number,
    userId: result.user_id as string | undefined,
  };
}

/**
 * 获取用户的所有邮箱
 * @param db 数据库实例
 * @param ipAddress IP地址
 * @returns 邮箱列表
 */
export async function getMailboxes(db: D1Database, ipAddress: string): Promise<Mailbox[]> {
  const now = getCurrentTimestamp();
  const results = await db.prepare(`SELECT id, address, created_at, expires_at, ip_address, last_accessed FROM mailboxes WHERE ip_address = ? AND expires_at > ? ORDER BY created_at DESC`).bind(ipAddress, now).all();
  
  if (!results.results) return [];
  
  return results.results.map(result => ({
    id: result.id as string,
    address: result.address as string,
    createdAt: result.created_at as number,
    expiresAt: result.expires_at as number,
    ipAddress: result.ip_address as string,
    lastAccessed: result.last_accessed as number,
  }));
}

/**
 * 删除邮箱
 * @param db 数据库实例
 * @param address 邮箱地址
 */
export async function deleteMailbox(db: D1Database, address: string): Promise<void> {
  // [feat] 由于外键设置了 ON DELETE CASCADE，直接删除邮箱即可级联删除相关邮件和附件
  await db.prepare(`DELETE FROM mailboxes WHERE address = ?`).bind(address).run();
}

/**
 * 清理孤立的附件（没有关联到任何邮件的附件）
 * @param db 数据库实例
 * @returns 删除的附件数量
 */
async function cleanupOrphanedAttachments(db: D1Database): Promise<number> {
    // [refactor] 优化孤立附件的清理逻辑
    try {
        // 一次性查询所有孤立附件及其分块信息
        const orphanedAttachmentsResult = await db.prepare(`
            SELECT a.id 
            FROM attachments a 
            LEFT JOIN emails e ON a.email_id = e.id 
            WHERE e.id IS NULL
        `).all<{ id: string }>();

        if (!orphanedAttachmentsResult.results || orphanedAttachmentsResult.results.length === 0) {
            return 0;
        }

        const attachmentIds = orphanedAttachmentsResult.results.map(row => row.id);
        const placeholders = attachmentIds.map(() => '?').join(',');

        console.log(`找到 ${attachmentIds.length} 个孤立附件，准备清理...`);

        // 批量删除附件分块
        await db.prepare(`DELETE FROM attachment_chunks WHERE attachment_id IN (${placeholders})`).bind(...attachmentIds).run();
        console.log(`已清理孤立附件的所有分块`);

        // 批量删除附件记录
        const deleteResult = await db.prepare(`DELETE FROM attachments WHERE id IN (${placeholders})`).bind(...attachmentIds).run();
        const deletedCount = deleteResult.meta?.changes || 0;
        console.log(`已清理 ${deletedCount} 个孤立附件记录`);

        return deletedCount;
    } catch (error) {
        console.error('清理孤立附件时出错:', error);
        return 0;
    }
}

/**
 * 清理过期邮箱
 * @param db 数据库实例
 * @returns 删除的邮箱数量
 */
export async function cleanupExpiredMailboxes(db: D1Database): Promise<number> {
  const now = getCurrentTimestamp();
  // [refactor] 由于数据库 schema 中设置了 ON DELETE CASCADE，
  // 删除 mailboxes 表中的记录会自动删除 emails, attachments, 和 attachment_chunks 中所有相关的记录。
  // 这大大简化了清理逻辑，并提高了性能。
  const result = await db.prepare(`DELETE FROM mailboxes WHERE expires_at <= ?`).bind(now).run();
  
  // 清理可能由于异常情况产生的孤立附件
  await cleanupOrphanedAttachments(db);
  
  return result.meta?.changes || 0;
}

/**
 * 清理过期邮件
 * @param db 数据库实例
 * @returns 删除的邮件数量
 */
export async function cleanupExpiredMails(db: D1Database): Promise<number> {
  const now = getCurrentTimestamp();
  const oneDayAgo = now - 24 * 60 * 60; // 24小时前的时间戳（秒）
  
  // [refactor] 同样利用 ON DELETE CASCADE 特性简化逻辑
  const result = await db.prepare(`DELETE FROM emails WHERE received_at <= ?`).bind(oneDayAgo).run();
  
  await cleanupOrphanedAttachments(db);
  
  return result.meta?.changes || 0;
}

/**
 * 清理已被阅读的邮件
 * @param db 数据库实例
 * @returns 删除的邮件数量
 */
export async function cleanupReadMails(db: D1Database): Promise<number> {
  // [refactor] 同样利用 ON DELETE CASCADE 特性简化逻辑
  const result = await db.prepare(`DELETE FROM emails WHERE is_read = 1`).run();
  
  await cleanupOrphanedAttachments(db);
  
  return result.meta?.changes || 0;
}

/**
 * 保存邮件
 * @param db 数据库实例
 * @param params 参数
 * @returns 保存的邮件
 */
export async function saveEmail(db: D1Database, params: SaveEmailParams): Promise<Email> {
  try {
    console.log('开始保存邮件...');
    
    const now = getCurrentTimestamp();
    const email: Email = {
      id: generateId(),
      mailboxId: params.mailboxId,
      fromAddress: params.fromAddress,
      fromName: params.fromName || '',
      toAddress: params.toAddress,
      subject: params.subject || '',
      textContent: params.textContent || '',
      htmlContent: params.htmlContent || '',
      receivedAt: now,
      hasAttachments: params.hasAttachments || false,
      isRead: false,
    };
    
    console.log('准备插入邮件:', email.id);
    
    await db.prepare(`INSERT INTO emails (id, mailbox_id, from_address, from_name, to_address, subject, text_content, html_content, received_at, has_attachments, is_read) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(email.id, email.mailboxId, email.fromAddress, email.fromName, email.toAddress, email.subject, email.textContent, email.htmlContent, email.receivedAt, email.hasAttachments ? 1 : 0, email.isRead ? 1 : 0).run();
    
    console.log('邮件保存成功:', email.id);
    
    return email;
  } catch (error) {
    console.error('保存邮件失败:', error);
    throw new Error(`保存邮件失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 保存附件
 * @param db 数据库实例
 * @param params 参数
 * @returns 保存的附件
 */
export async function saveAttachment(db: D1Database, params: SaveAttachmentParams): Promise<Attachment> {
  try {
    console.log('开始保存附件...');
    
    const now = getCurrentTimestamp();
    const attachmentId = generateId();
    
    // 检查附件大小，决定是否需要分块存储
    const isLarge = params.content.length > CHUNK_SIZE;
    console.log(`附件大小: ${params.content.length} 字节, 是否为大型附件: ${isLarge}`);
    
    if (isLarge) {
      // 大型附件，需要分块存储
      const contentLength = params.content.length;
      const chunksCount = Math.ceil(contentLength / CHUNK_SIZE);
      console.log(`将附件分为 ${chunksCount} 块存储`);
      
      // 创建附件记录，但不存储内容
      const attachment: Attachment = {
        id: attachmentId,
        emailId: params.emailId,
        filename: params.filename,
        mimeType: params.mimeType,
        content: '', // 大型附件不在主表存储内容
        size: params.size,
        createdAt: now,
        isLarge: true,
        chunksCount: chunksCount
      };
      
      // 插入附件记录
      await db.prepare(`INSERT INTO attachments (id, email_id, filename, mime_type, content, size, created_at, is_large, chunks_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(attachment.id, attachment.emailId, attachment.filename, attachment.mimeType, attachment.content, attachment.size, attachment.createdAt, attachment.isLarge ? 1 : 0, attachment.chunksCount).run();
      
      // 分块存储附件内容
      for (let i = 0; i < chunksCount; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, contentLength);
        const chunkContent = params.content.substring(start, end);
        const chunkId = generateId();
        
        await db.prepare(`INSERT INTO attachment_chunks (id, attachment_id, chunk_index, content) VALUES (?, ?, ?, ?)`).bind(chunkId, attachment.id, i, chunkContent).run();
        console.log(`保存附件块 ${i+1}/${chunksCount}`);
      }
      
      console.log('大型附件保存成功:', attachment.id);
      return attachment;
    } else {
      // 小型附件，直接存储
      const attachment: Attachment = {
        id: attachmentId,
        emailId: params.emailId,
        filename: params.filename,
        mimeType: params.mimeType,
        content: params.content,
        size: params.size,
        createdAt: now,
        isLarge: false,
        chunksCount: 0
      };
      
      await db.prepare(`INSERT INTO attachments (id, email_id, filename, mime_type, content, size, created_at, is_large, chunks_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(attachment.id, attachment.emailId, attachment.filename, attachment.mimeType, attachment.content, attachment.size, attachment.createdAt, attachment.isLarge ? 1 : 0, attachment.chunksCount).run();
      
      console.log('小型附件保存成功:', attachment.id);
      return attachment;
    }
  } catch (error) {
    console.error('保存附件失败:', error);
    throw new Error(`保存附件失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 获取邮件列表
 * @param db 数据库实例
 * @param mailboxId 邮箱ID
 * @returns 邮件列表
 */
export async function getEmails(db: D1Database, mailboxId: string): Promise<EmailListItem[]> {
  const results = await db.prepare(`SELECT id, mailbox_id, from_address, from_name, to_address, subject, received_at, has_attachments, is_read FROM emails WHERE mailbox_id = ? ORDER BY received_at DESC`).bind(mailboxId).all();
  
  if (!results.results) return [];
  
  return results.results.map(result => ({
    id: result.id as string,
    mailboxId: result.mailbox_id as string,
    fromAddress: result.from_address as string,
    fromName: result.from_name as string,
    toAddress: result.to_address as string,
    subject: result.subject as string,
    receivedAt: result.received_at as number,
    hasAttachments: !!result.has_attachments,
    isRead: !!result.is_read,
  }));
}

/**
 * 获取邮件详情
 * @param db 数据库实例
 * @param id 邮件ID
 * @returns 邮件详情
 */
export async function getEmail(db: D1Database, id: string): Promise<Email | null> {
  const email = await getEmailById(db, id);

  if (!email) return null;

  // 标记为已读
  await db.prepare(`UPDATE emails SET is_read = 1 WHERE id = ?`).bind(id).run();

  return {
    ...email,
    isRead: true,
  };
}

/**
 * 获取邮件详情（不修改已读状态）
 * @param db 数据库实例
 * @param id 邮件ID
 * @returns 邮件详情
 */
export async function getEmailById(db: D1Database, id: string): Promise<Email | null> {
  const result = await db.prepare(`SELECT id, mailbox_id, from_address, from_name, to_address, subject, text_content, html_content, received_at, has_attachments, is_read FROM emails WHERE id = ?`).bind(id).first();

  if (!result) return null;

  return {
    id: result.id as string,
    mailboxId: result.mailbox_id as string,
    fromAddress: result.from_address as string,
    fromName: result.from_name as string,
    toAddress: result.to_address as string,
    subject: result.subject as string,
    textContent: result.text_content as string,
    htmlContent: result.html_content as string,
    receivedAt: result.received_at as number,
    hasAttachments: !!result.has_attachments,
    isRead: !!result.is_read,
  };
}

/**
 * 获取附件列表
 * @param db 数据库实例
 * @param emailId 邮件ID
 * @returns 附件列表
 */
export async function getAttachments(db: D1Database, emailId: string): Promise<AttachmentListItem[]> {
  const results = await db.prepare(`SELECT id, email_id, filename, mime_type, size, created_at, is_large, chunks_count FROM attachments WHERE email_id = ? ORDER BY created_at ASC`).bind(emailId).all();
  
  if (!results.results) return [];
  
  return results.results.map(result => ({
    id: result.id as string,
    emailId: result.email_id as string,
    filename: result.filename as string,
    mimeType: result.mime_type as string,
    size: result.size as number,
    createdAt: result.created_at as number,
    isLarge: !!result.is_large,
    chunksCount: result.chunks_count as number
  }));
}

/**
 * 获取附件详情
 * @param db 数据库实例
 * @param id 附件ID
 * @returns 附件详情
 */
export async function getAttachment(db: D1Database, id: string): Promise<Attachment | null> {
  const result = await db.prepare(`SELECT id, email_id, filename, mime_type, content, size, created_at, is_large, chunks_count FROM attachments WHERE id = ?`).bind(id).first();
  
  if (!result) return null;
  
  const isLarge = !!result.is_large;
  let content = result.content as string;
  
  // 如果是大型附件，需要从块表中获取内容
  if (isLarge) {
    const chunksCount = result.chunks_count as number;
    content = await getAttachmentContent(db, id, chunksCount);
  }
  
  return {
    id: result.id as string,
    emailId: result.email_id as string,
    filename: result.filename as string,
    mimeType: result.mime_type as string,
    content: content,
    size: result.size as number,
    createdAt: result.created_at as number,
    isLarge: isLarge,
    chunksCount: result.chunks_count as number
  };
}

/**
 * 获取大型附件的内容
 * @param db 数据库实例
 * @param attachmentId 附件ID
 * @param chunksCount 块数量
 * @returns 完整的附件内容
 */
async function getAttachmentContent(db: D1Database, attachmentId: string, chunksCount: number): Promise<string> {
  let content = '';
  
  // 按顺序获取所有块
  for (let i = 0; i < chunksCount; i++) {
    const chunk = await db.prepare(`SELECT content FROM attachment_chunks WHERE attachment_id = ? AND chunk_index = ?`).bind(attachmentId, i).first();
    if (chunk && chunk.content) {
      content += chunk.content as string;
    }
  }
  
  return content;
}

/**
 * 删除邮件
 * @param db 数据库实例
 * @param id 邮件ID
 */
export async function deleteEmail(db: D1Database, id: string): Promise<void> {
  // [refactor] 由于外键设置了 ON DELETE CASCADE，直接删除邮件即可
  await db.prepare(`DELETE FROM emails WHERE id = ?`).bind(id).run();
}

// ==================== 用户管理 ====================

/**
 * 检查是否存在管理员
 * @param db 数据库实例
 * @returns 是否存在管理员
 */
export async function hasAdmin(db: D1Database): Promise<boolean> {
  const result = await db.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'admin'`).first();
  return (result?.count as number) > 0;
}

/**
 * 创建用户
 * @param db 数据库实例
 * @param username 用户名
 * @param passwordHash 密码哈希
 * @param role 角色
 * @returns 创建的用户
 */
export async function createUser(db: D1Database, username: string, passwordHash: string, role: 'admin' | 'user' = 'user'): Promise<User> {
  const now = getCurrentTimestamp();
  const user: User = {
    id: generateId(),
    username,
    passwordHash,
    role,
    createdAt: now,
    updatedAt: now,
  };
  
  await db.prepare(`INSERT INTO users (id, username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(user.id, user.username, user.passwordHash, user.role, user.createdAt, user.updatedAt)
    .run();
  
  return user;
}

/**
 * 根据用户名获取用户
 * @param db 数据库实例
 * @param username 用户名
 * @returns 用户信息
 */
export async function getUserByUsername(db: D1Database, username: string): Promise<User | null> {
  const result = await db.prepare(`SELECT id, username, password_hash, role, created_at, updated_at FROM users WHERE username = ?`).bind(username).first();
  
  if (!result) return null;
  
  return {
    id: result.id as string,
    username: result.username as string,
    passwordHash: result.password_hash as string,
    role: result.role as 'admin' | 'user',
    createdAt: result.created_at as number,
    updatedAt: result.updated_at as number,
  };
}

/**
 * 根据用户ID获取用户
 * @param db 数据库实例
 * @param id 用户ID
 * @returns 用户信息
 */
export async function getUserById(db: D1Database, id: string): Promise<User | null> {
  const result = await db.prepare(`SELECT id, username, password_hash, role, created_at, updated_at FROM users WHERE id = ?`).bind(id).first();
  
  if (!result) return null;
  
  return {
    id: result.id as string,
    username: result.username as string,
    passwordHash: result.password_hash as string,
    role: result.role as 'admin' | 'user',
    createdAt: result.created_at as number,
    updatedAt: result.updated_at as number,
  };
}

/**
 * 获取所有用户
 * @param db 数据库实例
 * @returns 用户列表
 */
export async function getAllUsers(db: D1Database): Promise<User[]> {
  const results = await db.prepare(`SELECT id, username, password_hash, role, created_at, updated_at FROM users ORDER BY created_at DESC`).all();
  
  if (!results.results) return [];
  
  return results.results.map(result => ({
    id: result.id as string,
    username: result.username as string,
    passwordHash: result.password_hash as string,
    role: result.role as 'admin' | 'user',
    createdAt: result.created_at as number,
    updatedAt: result.updated_at as number,
  }));
}

/**
 * 更新用户
 * @param db 数据库实例
 * @param id 用户ID
 * @param updates 更新内容
 * @returns 更新后的用户
 */
export async function updateUser(db: D1Database, id: string, updates: { username?: string; passwordHash?: string; role?: 'admin' | 'user' }): Promise<User | null> {
  const user = await getUserById(db, id);
  if (!user) return null;
  
  const now = getCurrentTimestamp();
  const newUsername = updates.username ?? user.username;
  const newPasswordHash = updates.passwordHash ?? user.passwordHash;
  const newRole = updates.role ?? user.role;
  
  await db.prepare(`UPDATE users SET username = ?, password_hash = ?, role = ?, updated_at = ? WHERE id = ?`)
    .bind(newUsername, newPasswordHash, newRole, now, id)
    .run();
  
  return {
    ...user,
    username: newUsername,
    passwordHash: newPasswordHash,
    role: newRole,
    updatedAt: now,
  };
}

/**
 * 删除用户
 * @param db 数据库实例
 * @param id 用户ID
 */
export async function deleteUser(db: D1Database, id: string): Promise<void> {
  // 删除用户及其会话
  await db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).bind(id).run();
  await db.prepare(`DELETE FROM users WHERE id = ?`).bind(id).run();
}

/**
 * 创建会话
 * @param db 数据库实例
 * @param userId 用户ID
 * @param expiresInDays 过期天数
 * @returns 会话
 */
export async function createSession(db: D1Database, userId: string, expiresInDays: number = 7): Promise<UserSession> {
  const now = getCurrentTimestamp();
  const session: UserSession = {
    id: generateId(),
    userId,
    expiresAt: calculateExpiryTimestamp(expiresInDays * 24),
    createdAt: now,
  };
  
  await db.prepare(`INSERT INTO user_sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`)
    .bind(session.id, session.userId, session.expiresAt, session.createdAt)
    .run();
  
  return session;
}

/**
 * 删除会话
 * @param db 数据库实例
 * @param sessionId 会话ID
 */
export async function deleteSession(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare(`DELETE FROM user_sessions WHERE id = ?`).bind(sessionId).run();
}

/**
 * 创建 API Token
 * @param db 数据库实例
 * @param params 创建参数
 * @returns 包含一次性明文 token 的结果
 */
export async function createApiToken(db: D1Database, params: CreateApiTokenParams): Promise<{ apiToken: ApiToken; plainToken: string }> {
  const now = getCurrentTimestamp();
  const plainToken = generateApiTokenValue();
  const tokenHash = await hashApiTokenValue(plainToken);
  const expiresAt = typeof params.expiresInDays === 'number' && params.expiresInDays > 0
    ? calculateExpiryTimestamp(params.expiresInDays * 24)
    : null;

  const apiToken: ApiToken = {
    id: generateId(),
    userId: params.userId,
    name: params.name,
    tokenHash,
    createdAt: now,
    updatedAt: now,
    expiresAt,
    lastUsedAt: null,
    revokedAt: null,
  };

  await db.prepare(`INSERT INTO api_tokens (id, user_id, name, token_hash, created_at, updated_at, expires_at, last_used_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      apiToken.id,
      apiToken.userId,
      apiToken.name,
      apiToken.tokenHash,
      apiToken.createdAt,
      apiToken.updatedAt,
      apiToken.expiresAt,
      apiToken.lastUsedAt,
      apiToken.revokedAt,
    )
    .run();

  return { apiToken, plainToken };
}

/**
 * 获取用户的 API Token 列表
 */
export async function getUserApiTokens(db: D1Database, userId: string): Promise<ApiToken[]> {
  const results = await db.prepare(`SELECT id, user_id, name, token_hash, created_at, updated_at, expires_at, last_used_at, revoked_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC`)
    .bind(userId)
    .all();

  if (!results.results) return [];

  return results.results.map((result) => ({
    id: result.id as string,
    userId: result.user_id as string,
    name: result.name as string,
    tokenHash: result.token_hash as string,
    createdAt: result.created_at as number,
    updatedAt: result.updated_at as number,
    expiresAt: (result.expires_at as number | null) ?? null,
    lastUsedAt: (result.last_used_at as number | null) ?? null,
    revokedAt: (result.revoked_at as number | null) ?? null,
  }));
}

/**
 * 获取所有 API Token（管理员）
 */
export async function getAllApiTokens(db: D1Database): Promise<Array<ApiToken & { creatorUsername: string }>> {
  const results = await db.prepare(`
    SELECT t.id, t.user_id, t.name, t.token_hash, t.created_at, t.updated_at, t.expires_at, t.last_used_at, t.revoked_at, u.username AS creator_username
    FROM api_tokens t
    LEFT JOIN users u ON t.user_id = u.id
    ORDER BY t.created_at DESC
  `).all();

  if (!results.results) return [];

  return results.results.map((result) => ({
    id: result.id as string,
    userId: result.user_id as string,
    name: result.name as string,
    tokenHash: result.token_hash as string,
    createdAt: result.created_at as number,
    updatedAt: result.updated_at as number,
    expiresAt: (result.expires_at as number | null) ?? null,
    lastUsedAt: (result.last_used_at as number | null) ?? null,
    revokedAt: (result.revoked_at as number | null) ?? null,
    creatorUsername: (result.creator_username as string | null) ?? 'unknown',
  }));
}

/**
 * 吊销 API Token（仅限所属用户）
 */
export async function revokeApiToken(db: D1Database, tokenId: string, userId: string): Promise<boolean> {
  const now = getCurrentTimestamp();
  const result = await db.prepare(`UPDATE api_tokens SET revoked_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL`)
    .bind(now, now, tokenId, userId)
    .run();

  return (result.meta?.changes || 0) > 0;
}

/**
 * 吊销 API Token（管理员）
 */
export async function revokeApiTokenById(db: D1Database, tokenId: string): Promise<boolean> {
  const now = getCurrentTimestamp();
  const result = await db.prepare(`UPDATE api_tokens SET revoked_at = ?, updated_at = ? WHERE id = ? AND revoked_at IS NULL`)
    .bind(now, now, tokenId)
    .run();

  return (result.meta?.changes || 0) > 0;
}

/**
 * 根据明文 token 查找有效 Token
 */
export async function getValidApiTokenByValue(db: D1Database, plainToken: string): Promise<ApiToken | null> {
  const now = getCurrentTimestamp();
  const tokenHash = await hashApiTokenValue(plainToken);
  const result = await db.prepare(`SELECT id, user_id, name, token_hash, created_at, updated_at, expires_at, last_used_at, revoked_at FROM api_tokens WHERE token_hash = ? AND revoked_at IS NULL`)
    .bind(tokenHash)
    .first();

  if (!result) return null;

  const expiresAt = (result.expires_at as number | null) ?? null;
  if (expiresAt !== null && expiresAt <= now) {
    return null;
  }

  return {
    id: result.id as string,
    userId: result.user_id as string,
    name: result.name as string,
    tokenHash: result.token_hash as string,
    createdAt: result.created_at as number,
    updatedAt: result.updated_at as number,
    expiresAt,
    lastUsedAt: (result.last_used_at as number | null) ?? null,
    revokedAt: (result.revoked_at as number | null) ?? null,
  };
}

/**
 * 更新 Token 最后使用时间
 */
export async function touchApiTokenLastUsed(db: D1Database, tokenId: string): Promise<void> {
  const now = getCurrentTimestamp();
  await db.prepare(`UPDATE api_tokens SET last_used_at = ?, updated_at = ? WHERE id = ?`)
    .bind(now, now, tokenId)
    .run();
}

/**
 * 获取用户的邮箱数量
 * @param db 数据库实例
 * @param userId 用户ID
 * @returns 邮箱数量
 */
export async function getUserMailboxCount(db: D1Database, userId: string): Promise<number> {
  const now = getCurrentTimestamp();
  const result = await db.prepare(`SELECT COUNT(*) as count FROM mailboxes WHERE user_id = ? AND expires_at > ?`).bind(userId, now).first();
  return (result?.count as number) || 0;
}

/**
 * 获取用户的所有邮箱
 * @param db 数据库实例
 * @param userId 用户ID
 * @returns 邮箱列表
 */
export async function getUserMailboxes(db: D1Database, userId: string): Promise<Mailbox[]> {
  const now = getCurrentTimestamp();
  const results = await db.prepare(`SELECT id, address, created_at, expires_at, ip_address, last_accessed, user_id FROM mailboxes WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC`).bind(userId, now).all();
  
  if (!results.results) return [];
  
  return results.results.map(result => ({
    id: result.id as string,
    address: result.address as string,
    createdAt: result.created_at as number,
    expiresAt: result.expires_at as number,
    ipAddress: result.ip_address as string,
    lastAccessed: result.last_accessed as number,
    userId: result.user_id as string | undefined,
  }));
}

/**
 * 获取所有邮箱（管理员用）
 * @param db 数据库实例
 * @returns 所有邮箱列表
 */
export async function getAllMailboxes(db: D1Database): Promise<Mailbox[]> {
  const results = await db.prepare(`SELECT m.id, m.address, m.created_at, m.expires_at, m.ip_address, m.last_accessed, m.user_id, u.username 
    FROM mailboxes m 
    LEFT JOIN users u ON m.user_id = u.id 
    WHERE m.expires_at > ? 
    ORDER BY m.created_at DESC`).bind(getCurrentTimestamp()).all();
  
  if (!results.results) return [];
  
  return results.results.map(result => ({
    id: result.id as string,
    address: result.address as string,
    createdAt: result.created_at as number,
    expiresAt: result.expires_at as number,
    ipAddress: result.ip_address as string,
    lastAccessed: result.last_accessed as number,
    userId: result.user_id as string | undefined,
  }));
}

/**
 * 获取系统统计
 * @param db 数据库实例
 * @returns 统计信息
 */
export async function getSystemStats(db: D1Database): Promise<{ users: number; mailboxes: number; emails: number }> {
  const usersResult = await db.prepare(`SELECT COUNT(*) as count FROM users`).first();
  const mailboxesResult = await db.prepare(`SELECT COUNT(*) as count FROM mailboxes WHERE expires_at > ?`).bind(getCurrentTimestamp()).first();
  const emailsResult = await db.prepare(`SELECT COUNT(*) as count FROM emails`).first();
  
  return {
    users: (usersResult?.count as number) || 0,
    mailboxes: (mailboxesResult?.count as number) || 0,
    emails: (emailsResult?.count as number) || 0,
  };
}
