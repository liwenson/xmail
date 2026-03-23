import * as PostalMimeModule from 'postal-mime';
import { Env, ParsedEmail } from './types';
import { getMailbox, saveEmail, saveAttachment } from './database';

const PostalMime = PostalMimeModule.default;

interface EmailAddressLike {
  address: string;
  name?: string;
}

interface EmailMessageLike {
  raw: ReadableStream | ArrayBuffer | string;
}

/**
 * 处理接收到的邮件
 * @param message 邮件消息
 * @param env 环境变量
 */
export async function handleEmail(message: EmailMessageLike, env: Env): Promise<void> {
  try {
    const parser = new PostalMime();
    const email = await parser.parse(message.raw) as ParsedEmail;

    const primaryRecipient = email.to[0] as EmailAddressLike | undefined;
    if (!primaryRecipient?.address) {
      throw new Error('收件地址无效');
    }

    // 提取邮箱地址部分（从email.to获取 ）
    const mailboxAddress = primaryRecipient.address.split('@')[0];
    
    // 查找对应的邮箱
    const mailbox = await getMailbox(env.DB, mailboxAddress);
    
    if (!mailbox) {
      throw new Error('邮箱不存在');
    }

    // 保存邮件
    const savedEmail = await saveEmail(env.DB, {
      mailboxId: mailbox.id,
      fromAddress: email.from.address,
      fromName: email.from.name || '',
      toAddress: mailboxAddress,
      subject: email.subject || '',
      textContent: email.text || '',
      htmlContent: email.html || '',
      hasAttachments: !!email.attachments?.length,
    });

    // 保存附件（如果有）
    if (email.attachments && email.attachments.length > 0) {
      console.log(`开始保存 ${email.attachments.length} 个附件`);
      
      for (const attachment of email.attachments) {
        try {
          // 将 ArrayBuffer 转换为 Base64 字符串
          const base64Content = arrayBufferToBase64(attachment.content);
          
          // 计算附件大小（字节）
          const size = attachment.size || attachment.content.byteLength;
          
          // 保存附件
          await saveAttachment(env.DB, {
            emailId: savedEmail.id,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            content: base64Content,
            size: size
          });
          
          console.log(`附件 ${attachment.filename} 保存成功`);
        } catch (attachmentError) {
          console.error(`保存附件 ${attachment.filename} 失败:`, attachmentError);
          // 继续处理其他附件，不中断流程
        }
      }
    }
  } catch (error) {
    console.error('处理邮件失败:', error);
  }
}

/**
 * 将 ArrayBuffer 转换为 Base64 字符串
 * @param buffer ArrayBuffer 数据
 * @returns Base64 字符串
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
