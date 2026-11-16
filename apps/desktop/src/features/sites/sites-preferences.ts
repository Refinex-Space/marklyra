import { builtinEngines, normalizeEngines, type SearchEngine } from './model/engines.js';

export type SitesView = 'cards' | 'list';
export type ThirdPartyIcons = 'off' | 'duckduckgo' | 'google';
/** Site navigation settings: stored with the shell preferences, so every window follows. */
export interface SitesPreferences {
  /** Shows the entry in the titlebar; the saved sites stay in the folder either way. */
  enabled: boolean;
  /** Id of the engine the search box starts with. */
  engine: string;
  engines: SearchEngine[];
  view: SitesView;
  /** Pinned sites under the search box. */
  showPinned: boolean;
  /** Fetch a title, description and icon when a site is added. */
  fetchMetadata: boolean;
  /** Optional icon service. Off sends nothing about the saved domains. */
  thirdPartyIcons: ThirdPartyIcons;
}
export const defaultSitesPreferences: Readonly<SitesPreferences> = Object.freeze({
  enabled: true,
  engine: 'bing',
  engines: builtinEngines(),
  view: 'cards',
  showPinned: true,
  fetchMetadata: true,
  thirdPartyIcons: 'off',
});

export function normalizeSitesPreferences(value: unknown): SitesPreferences {
  const input =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const engines = normalizeEngines(input.engines);
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : defaultSitesPreferences.enabled,
    engines,
    engine: engines.some((e) => e.id === input.engine)
      ? (input.engine as string)
      : (engines[0]?.id ?? 'bing'),
    view: input.view === 'list' ? 'list' : 'cards',
    showPinned:
      typeof input.showPinned === 'boolean' ? input.showPinned : defaultSitesPreferences.showPinned,
    fetchMetadata:
      typeof input.fetchMetadata === 'boolean'
        ? input.fetchMetadata
        : defaultSitesPreferences.fetchMetadata,
    thirdPartyIcons:
      input.thirdPartyIcons === 'duckduckgo' || input.thirdPartyIcons === 'google'
        ? input.thirdPartyIcons
        : 'off',
  };
}
