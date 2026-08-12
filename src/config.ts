import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const DOCNEST_THEME_NAMES = [
  'slate-modern',
  'editorial-atlas',
  'precision-index',
  'archive-room',
  'swiss-manual',
] as const;

const DOCNEST_LEGACY_THEME_NAMES = ['current-docs'] as const;

export const DOCNEST_COLOR_MODES = ['auto', 'light', 'dark'] as const;

export type DocNestThemeName =
  | (typeof DOCNEST_THEME_NAMES)[number]
  | (typeof DOCNEST_LEGACY_THEME_NAMES)[number];
export type DocNestColorMode = (typeof DOCNEST_COLOR_MODES)[number];

export type DocNestConfig = {
  docsDir?: string;
  site?: {
    title?: string;
    subtitle?: string;
    logo?: string;
    storageKeyPrefix?: string;
  };
  navigation?: {
    rootDirectoryOrder?: string[];
  };
  appearance?: {
    defaultTheme?: DocNestThemeName;
    defaultMode?: DocNestColorMode;
    enabledThemes?: DocNestThemeName[];
  };
  server?: {
    host?: string;
    port?: number;
    watch?: boolean;
    openBrowser?: boolean;
  };
  export?: {
    watermark?: {
      enabled?: boolean;
      text?: string;
    };
  };
};

export function defineConfig(config: DocNestConfig): DocNestConfig {
  return config;
}

export type ResolvedDocNestConfig = Required<DocNestConfig> & {
  projectRoot: string;
  docsDir: string;
  site: Required<NonNullable<DocNestConfig['site']>>;
  navigation: Required<NonNullable<DocNestConfig['navigation']>>;
  appearance: Required<NonNullable<DocNestConfig['appearance']>>;
  server: Required<NonNullable<DocNestConfig['server']>>;
  export: {
    watermark: Required<NonNullable<NonNullable<DocNestConfig['export']>['watermark']>>;
  };
};

const DEFAULT_CONFIG_FILE = 'docnest.config.mjs';
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<{ default?: DocNestConfig }>;

async function readProjectName(projectRoot: string): Promise<string> {
  try {
    const packageJson = JSON.parse(
      await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8'),
    ) as { name?: unknown };
    if (typeof packageJson.name === 'string' && packageJson.name.trim()) {
      return packageJson.name.trim();
    }
  } catch {
    // package.json is optional for a document-only folder.
  }
  return path.basename(projectRoot);
}

function normalizePort(value: unknown, fallback: number): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return fallback;
  return port;
}

function normalizeThemeName(value: unknown): (typeof DOCNEST_THEME_NAMES)[number] | null {
  if (value === 'current-docs') return 'slate-modern';
  return typeof value === 'string' && DOCNEST_THEME_NAMES.includes(value as (typeof DOCNEST_THEME_NAMES)[number])
    ? value as (typeof DOCNEST_THEME_NAMES)[number]
    : null;
}

function isColorMode(value: unknown): value is DocNestColorMode {
  return typeof value === 'string' && DOCNEST_COLOR_MODES.includes(value as DocNestColorMode);
}

function resolveAppearance(config: NonNullable<DocNestConfig['appearance']>): Required<NonNullable<DocNestConfig['appearance']>> {
  const defaultTheme = normalizeThemeName(config.defaultTheme) ?? 'slate-modern';
  const configuredThemes = Array.isArray(config.enabledThemes)
    ? Array.from(new Set(config.enabledThemes.map(normalizeThemeName).filter((theme): theme is (typeof DOCNEST_THEME_NAMES)[number] => theme !== null)))
    : [...DOCNEST_THEME_NAMES];
  const enabledThemes = configuredThemes.length > 0 ? configuredThemes : [...DOCNEST_THEME_NAMES];
  if (!enabledThemes.includes(defaultTheme)) enabledThemes.unshift(defaultTheme);

  return {
    defaultTheme,
    defaultMode: isColorMode(config.defaultMode) ? config.defaultMode : 'auto',
    enabledThemes,
  };
}

export async function loadConfig(projectRoot = process.cwd()): Promise<ResolvedDocNestConfig> {
  const configPath = path.join(projectRoot, DEFAULT_CONFIG_FILE);
  let userConfig: DocNestConfig = {};
  try {
    const loaded = await dynamicImport(`${pathToFileURL(configPath).href}?v=${Date.now()}`);
    userConfig = loaded.default ?? {};
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    if (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'ENOENT') throw error;
  }

  const projectName = await readProjectName(projectRoot);
  const site = userConfig.site ?? {};
  const navigation = userConfig.navigation ?? {};
  const appearance = userConfig.appearance ?? {};
  const server = userConfig.server ?? {};
  const watermark = userConfig.export?.watermark ?? {};
  const storageKeyPrefix = site.storageKeyPrefix?.trim() || `docnest:${projectName}`;

  return {
    projectRoot,
    docsDir: path.resolve(projectRoot, userConfig.docsDir?.trim() || 'docs'),
    site: {
      title: site.title?.trim() || projectName,
      subtitle: site.subtitle?.trim() || '本地 Markdown 文档服务',
      logo: site.logo?.trim() || '',
      storageKeyPrefix,
    },
    navigation: {
      rootDirectoryOrder: Array.isArray(navigation.rootDirectoryOrder)
        ? navigation.rootDirectoryOrder.filter((item): item is string => typeof item === 'string')
        : [],
    },
    appearance: resolveAppearance(appearance),
    server: {
      host: server.host?.trim() || '127.0.0.1',
      port: normalizePort(server.port, 3000),
      watch: server.watch ?? true,
      openBrowser: server.openBrowser ?? true,
    },
    export: {
      watermark: {
        enabled: watermark.enabled ?? false,
        text: watermark.text?.trim() || site.title?.trim() || projectName,
      },
    },
  } as ResolvedDocNestConfig;
}
