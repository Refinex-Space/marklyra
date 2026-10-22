import { describe, expect, it } from 'vitest';
import { resolveLinkTarget } from '../src/features/documents/link-target.js';

const root = '/Users/refinex/develop/refinex-vault';
const current = `${root}/框架生态/LLMentor/README.md`;
const target = (url: string, anchor = '', cur: string | null = current, ws: string | null = root) =>
  resolveLinkTarget(url, anchor, cur, ws);

describe('resolveLinkTarget', () => {
  it('resolves the absolute path with spaces and CJK from the report', () => {
    expect(
      target(`${root}/框架生态/LLMentor/03_Spring AI/11_Spring AI 记忆管理技术：持久化记忆.md`),
    ).toEqual({
      ok: true,
      relativePath: '框架生态/LLMentor/03_Spring AI/11_Spring AI 记忆管理技术：持久化记忆.md',
      anchor: '',
    });
  });
  it('resolves relative links against the current document, including dot segments', () => {
    expect(target('03_Spring AI/12_Spring AI 核心特性：Advisor.md')).toMatchObject({
      ok: true,
      relativePath: '框架生态/LLMentor/03_Spring AI/12_Spring AI 核心特性：Advisor.md',
    });
    expect(target('../../工作/a.md')).toMatchObject({ ok: true, relativePath: '工作/a.md' });
    expect(target('./b.md#节')).toMatchObject({
      ok: true,
      relativePath: '框架生态/LLMentor/b.md',
      anchor: '#节',
    });
  });
  it('accepts file: URLs and Windows paths with verbatim prefixes', () => {
    expect(target(`file://${root}/x.md`)).toMatchObject({ ok: true, relativePath: 'x.md' });
    expect(
      target(
        String.raw`D:\vault\sub\y.md`,
        '',
        String.raw`\\?\D:\vault\a.md`,
        String.raw`\\?\D:\Vault`,
      ),
    ).toMatchObject({ ok: true, relativePath: 'sub/y.md' });
  });
  it('refuses anything outside the open folder', () => {
    expect(target('/etc/hosts.md')).toMatchObject({ ok: false });
    expect(target('../../../../x.md')).toMatchObject({ ok: false });
    expect(target(`${root}-other/a.md`)).toMatchObject({ ok: false });
    expect(target(root)).toMatchObject({ ok: false });
  });
  it('explains missing context instead of guessing', () => {
    expect(target('a.md', '', current, null)).toMatchObject({ ok: false });
    expect(target('a.md', '', null)).toMatchObject({ ok: false });
    expect(target('mailto:a@b.c')).toMatchObject({ ok: false });
  });
  it('keeps case on POSIX volumes', () => {
    expect(target(`${root.toUpperCase()}/a.md`)).toMatchObject({ ok: false });
  });
});
