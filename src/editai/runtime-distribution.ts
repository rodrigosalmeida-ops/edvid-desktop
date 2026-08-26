import distribution from '../../resources/editai-distribution.json';
import { runtimePackKey } from '../runtime';

type RuntimePackDescriptor = {
  key: string;
  file: string;
  sha256: string;
};

type DistributionConfig = {
  schemaVersion?: number;
  runtimePackBaseUrl?: string;
  updateFeedUrl?: string;
  runtimePacks?: Record<string, RuntimePackDescriptor>;
};

const config = distribution as DistributionConfig;
export type EditAiRuntimePack = RuntimePackDescriptor & { baseUrl: string };

function cleanHttps(value: string | undefined): string {
  const clean = value?.trim().replace(/\/$/u, '') || '';
  return /^https:\/\//iu.test(clean) ? clean : '';
}

export function editAiRuntimePack(platform: NodeJS.Platform, arch: string): EditAiRuntimePack | null {
  const baseUrl = cleanHttps(process.env.EDITAI_RUNTIME_PACK_BASE_URL) || cleanHttps(config.runtimePackBaseUrl);
  const target = `${platform}-${arch}`;
  const item = config.runtimePacks?.[target];
  if (!baseUrl || !item) return null;
  if (item.key !== runtimePackKey()) return null;
  if (!/^[a-f0-9]{64}$/iu.test(item.sha256)) return null;
  const expectedFile = `runtimes-${target}-${item.key}.tar.gz`;
  if (item.file !== expectedFile) return null;
  return { ...item, baseUrl };
}

export function editAiUpdateFeedUrl(): string {
  const env = process.env.EDITAI_UPDATE_FEED_URL?.trim() || '';
  if (/^https:\/\/[^\s]+\/feed\.json$/iu.test(env)) return env;
  const configured = config.updateFeedUrl?.trim() || '';
  return /^https:\/\/[^\s]+\/feed\.json$/iu.test(configured) ? configured : '';
}
