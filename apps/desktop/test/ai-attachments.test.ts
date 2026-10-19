import { describe, expect, it } from 'vitest';
import {
  attachmentBlocks,
  attachmentText,
  prepareAttachment,
} from '../src/features/ai/attachments.js';
import type { DraftAttachment } from '../src/features/ai/types.js';

const value = (mimeType: string, data = 'aGVsbG8='): DraftAttachment => ({
  id: 'fixture',
  name: 'notes.txt',
  mimeType,
  data,
  digest: 'a'.repeat(64),
  size: 5,
});
describe('ACP attachment content', () => {
  it('embeds text when supported and sends named text to text-only agents', () => {
    expect(
      attachmentBlocks([value('text/plain')], { image: false, embeddedContext: true })[0],
    ).toMatchObject({ type: 'resource', resource: { text: 'hello', mimeType: 'text/plain' } });
    expect(
      attachmentBlocks([value('text/plain')], { image: false, embeddedContext: false })[0],
    ).toMatchObject({ type: 'text', text: expect.stringContaining('notes.txt') });
  });
  it('requires declared image or binary-resource support before sending', () => {
    expect(() =>
      attachmentBlocks([value('image/png')], { image: false, embeddedContext: true }),
    ).toThrow('图片');
    expect(
      attachmentBlocks([value('image/png')], { image: true, embeddedContext: false })[0],
    ).toMatchObject({ type: 'image', data: 'aGVsbG8=' });
    const binary = value('application/pdf', 'AP8=');
    expect(attachmentText(binary)).toBeNull();
    expect(() => attachmentBlocks([binary], { image: true, embeddedContext: false })).toThrow(
      '文件类型',
    );
    expect(attachmentBlocks([binary], { image: false, embeddedContext: true })[0]).toMatchObject({
      type: 'resource',
      resource: { blob: 'AP8=' },
    });
  });
  it('bounds count and bytes and hashes files independently of their names', async () => {
    expect(() =>
      attachmentBlocks(
        Array.from({ length: 9 }, () => value('text/plain')),
        { image: false, embeddedContext: true },
      ),
    ).toThrow('最多');
    expect(() =>
      attachmentBlocks([{ ...value('text/plain'), size: 5 * 1024 * 1024 }], {
        image: false,
        embeddedContext: true,
      }),
    ).toThrow('总量');
    const file = await prepareAttachment(new File(['hello'], '中文说明.md'));
    expect(file.mimeType).toBe('text/markdown');
    expect(attachmentText(file)).toBe('hello');
    expect(file.digest).toHaveLength(64);
  });
});
