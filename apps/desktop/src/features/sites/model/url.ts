import { addressOf } from './query.js';

/**
 * The address to save for what was typed in the add dialog: a full http(s) address, or a
 * bare domain, localhost or IP given `https://` (`http://` for local hosts). `null` when it
 * is not an address.
 */
export const siteAddress = (raw: string): string | null => addressOf(raw);

/** `www.` and the scheme dropped, for showing under a title. */
export function displayHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** The host without `www.` and port, for comparing two addresses. */
export function hostKey(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}
