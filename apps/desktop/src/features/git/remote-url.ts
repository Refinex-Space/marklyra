// Remote URL checks done before anything reaches git: recognise the URL form, catch pasted web
// pages and embedded passwords, and offer the HTTPS/SSH twin of hosted repositories.

export interface RemoteUrlInfo {
  protocol: 'https' | 'http' | 'ssh' | 'git' | 'file';
  host: string | null;
  /** `owner/name` for recognised hosting services. */
  repository: string | null;
  provider: 'GitHub' | 'Gitee' | 'GitLab' | 'Bitbucket' | 'Codeup' | null;
}
export interface RemoteUrlAdvice {
  info: RemoteUrlInfo | null;
  error: string | null;
  warnings: string[];
  /** A cleaned-up URL to use instead (web page pasted, missing `.git`). */
  suggestion: string | null;
  /** The same repository over the other protocol. */
  alternatives: { label: string; url: string }[];
}

const PROVIDERS: Record<string, RemoteUrlInfo['provider']> = {
  'github.com': 'GitHub',
  'gitee.com': 'Gitee',
  'gitlab.com': 'GitLab',
  'bitbucket.org': 'Bitbucket',
  'codeup.aliyun.com': 'Codeup',
};
const SCP = /^([A-Za-z0-9._-]+)@([A-Za-z0-9.-]+):(?!\/\/)([^\s]+)$/;

export function parseRemoteUrl(value: string): RemoteUrlInfo | null {
  const text = value.trim();
  const scp = SCP.exec(text);
  if (scp) {
    const host = (scp[2] ?? '').toLowerCase();
    return {
      protocol: 'ssh',
      host,
      repository: repositoryPath(host, scp[3] ?? ''),
      provider: PROVIDERS[host] ?? null,
    };
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const protocol = url.protocol.slice(0, -1);
  if (!['https', 'http', 'ssh', 'git', 'file'].includes(protocol)) return null;
  const host = url.hostname ? url.hostname.toLowerCase() : null;
  if (protocol !== 'file' && !host) return null;
  return {
    protocol: protocol as RemoteUrlInfo['protocol'],
    host,
    repository: host ? repositoryPath(host, url.pathname) : null,
    provider: host ? (PROVIDERS[host] ?? null) : null,
  };
}
function repositoryPath(host: string, path: string): string | null {
  if (!PROVIDERS[host]) return null;
  const parts = path
    .replace(/^\/+/, '')
    .replace(/\.git$/, '')
    .split('/')
    .filter(Boolean);
  // GitLab allows nested groups; everything else is owner/name.
  if (host === 'gitlab.com' || host === 'codeup.aliyun.com') {
    const end = parts.indexOf('-');
    const list = end >= 0 ? parts.slice(0, end) : parts;
    return list.length >= 2 ? list.join('/') : null;
  }
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
}

export function remoteUrlAdvice(value: string): RemoteUrlAdvice {
  const text = value.trim();
  const advice: RemoteUrlAdvice = {
    info: null,
    error: null,
    warnings: [],
    suggestion: null,
    alternatives: [],
  };
  if (!text) {
    advice.error = '请填写远程仓库地址';
    return advice;
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are rejected.
  if (/\s|[\u0000-\u001f]/.test(text)) {
    advice.error = '地址不能包含空格或控制字符';
    return advice;
  }
  if (text.startsWith('-') || /^[a-z][a-z0-9+.-]*::/i.test(text)) {
    advice.error = '不支持这种地址形式';
    return advice;
  }
  const info = parseRemoteUrl(text);
  if (!info) {
    advice.error = '无法识别的地址。支持 https://、ssh://、git@主机:路径 与 file:// 形式';
    return advice;
  }
  advice.info = info;
  if (info.protocol === 'http') advice.warnings.push('HTTP 连接未加密，建议改用 HTTPS 或 SSH');
  if (info.protocol === 'git')
    advice.warnings.push('git:// 协议既不加密也不认证，只能用于只读拉取');
  if (/^https?:\/\/[^/@]+:[^/@]+@/.test(text))
    advice.warnings.push('地址中包含密码或令牌，会以明文保存在 .git/config 中；建议改用凭据设置');
  if (info.provider && info.host && info.repository) {
    const https = `https://${info.host}/${info.repository}.git`;
    const ssh = `git@${info.host}:${info.repository}.git`;
    if (
      (info.protocol === 'https' || info.protocol === 'http') &&
      text !== https &&
      !text.includes('@')
    ) {
      // A repository web page (…/tree/main, …/blob/…) or a URL without .git.
      advice.suggestion = https;
    }
    if (info.protocol === 'ssh')
      advice.alternatives.push({ label: `改用 HTTPS（${info.provider}）`, url: https });
    else advice.alternatives.push({ label: `改用 SSH（${info.provider}）`, url: ssh });
  }
  return advice;
}

/** Remote names git accepts and people can type. */
export function remoteNameError(value: string): string | null {
  if (!value) return '请填写远程名称';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value))
    return '远程名称只能包含字母、数字、. _ -，且以字母或数字开头';
  return null;
}
