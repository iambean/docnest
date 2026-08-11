import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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
