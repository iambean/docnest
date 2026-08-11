#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, type ResolvedDocNestConfig } from './config';

type CliOptions = {
  port?: number;
  host?: string;
  openBrowser?: boolean;
  watch?: boolean;
  docsDir?: string;
};

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === '--port' && next) {
      options.port = Number(next);
      index += 1;
    } else if (arg === '--host' && next) {
      options.host = next;
      index += 1;
    } else if (arg === '--docs-dir' && next) {
      options.docsDir = next;
      index += 1;
    } else if (arg === '--no-open') {
      options.openBrowser = false;
    } else if (arg === '--open') {
      options.openBrowser = true;
    } else if (arg === '--no-watch') {
      options.watch = false;
    } else if (arg === '--watch') {
      options.watch = true;
    }
  }
  return options;
}

function applyCliOverrides(config: ResolvedDocNestConfig, options: CliOptions): ResolvedDocNestConfig {
  return {
    ...config,
    docsDir: options.docsDir ? path.resolve(config.projectRoot, options.docsDir) : config.docsDir,
    server: {
      ...config.server,
      ...(Number.isInteger(options.port) && options.port && options.port > 0 ? { port: options.port } : {}),
      ...(options.host ? { host: options.host } : {}),
      ...(typeof options.openBrowser === 'boolean' ? { openBrowser: options.openBrowser } : {}),
      ...(typeof options.watch === 'boolean' ? { watch: options.watch } : {}),
    },
  };
}

function exposeConfig(config: ResolvedDocNestConfig): void {
  process.env.DOCS_ROOT = config.docsDir;
  process.env.DOCS_TITLE = config.site.title;
  process.env.DOCS_SUBTITLE = config.site.subtitle;
  process.env.DOCS_LOGO = config.site.logo;
  process.env.DOCS_STORAGE_KEY_PREFIX = config.site.storageKeyPrefix;
  process.env.DOCS_ROOT_DIRECTORY_ORDER = JSON.stringify(config.navigation.rootDirectoryOrder);
  process.env.DOCS_WATERMARK_ENABLED = String(config.export.watermark.enabled);
  process.env.DOCS_WATERMARK_TEXT = config.export.watermark.text;
  process.env.DOCS_HOST = config.server.host;
  process.env.DOCS_PORT_START = String(config.server.port);
  process.env.DOCS_WATCH_ENABLED = String(config.server.watch);
  process.env.DOCS_OPEN_BROWSER = String(config.server.openBrowser);
}

const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<unknown>;

async function main(): Promise<void> {
  const [command = 'serve', ...args] = process.argv.slice(2);
  if (command !== 'serve') {
    throw new Error(`未知命令：${command}。当前仅支持 docnest serve。`);
  }
  const config = applyCliOverrides(await loadConfig(), parseArgs(args));
  exposeConfig(config);
  await dynamicImport(`${pathToFileURL(path.join(__dirname, 'server.js')).href}?v=${Date.now()}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`DocNest 启动失败：${message}`);
  process.exitCode = 1;
});
