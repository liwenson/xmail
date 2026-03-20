/**
 * 密码哈希工具模块
 * 使用 Web Crypto API 进行密码哈希
 */

const SALT_LENGTH = 16;
const HASH_ITERATIONS = 100000;
const HASH_LENGTH = 256;

/**
 * 生成密码哈希
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  
  // 生成盐
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  
  // 导入密钥
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  // 派生哈希
  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: HASH_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    HASH_LENGTH
  );
  
  // 转换为十六进制字符串
  const saltHex = arrayBufferToHex(salt);
  const hashHex = arrayBufferToHex(hash);
  
  return `${saltHex}:${hashHex}`;
}

/**
 * 验证密码
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const [saltHex, hashHex] = storedHash.split(':');
    
    if (!saltHex || !hashHex) {
      return false;
    }
    
    const encoder = new TextEncoder();
    const salt = hexToArrayBuffer(saltHex);
    
    // 重新计算哈希
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    
    const hash = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: HASH_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      HASH_LENGTH
    );
    
    const hashComputedHex = arrayBufferToHex(hash);
    
    return hashComputedHex === hashHex;
  } catch {
    return false;
  }
}

/**
 * ArrayBuffer 转十六进制字符串
 */
function arrayBufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 十六进制字符串转 ArrayBuffer
 */
function hexToArrayBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}
