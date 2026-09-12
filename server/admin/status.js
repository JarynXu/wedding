import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const UNKNOWN = 'unknown';
const NOT_CONFIGURED = 'not_configured';

export function createAdminStatus({ blessings = null, startedAt = new Date(), buildInfo = readBuildInfo(), clock = () => new Date() } = {}) {
  const start = dateValue(startedAt);
  return {
    async snapshot() {
      const now = clock();
      const database = await readBlessingStats(blessings);
      const hub = notificationStatus(blessings);
      const connectionCount = blessings && blessings.streams instanceof Set ? blessings.streams.size : blessings ? null : 0;
      return {
        generatedAt: now.toISOString(),
        application: {
          version: buildInfo.version || UNKNOWN,
          build: buildInfo.build || UNKNOWN,
          buildTime: buildInfo.buildTime || UNKNOWN,
          buildSource: buildInfo.buildSource || UNKNOWN,
          commit: buildInfo.commit || UNKNOWN,
        },
        instance: {
          startedAt: start ? start.toISOString() : UNKNOWN,
          uptimeSeconds: start ? Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000)) : null,
          realtimeConnections: connectionCount,
          realtimeConnectionScope: 'current_instance',
        },
        database: {
          connection: database.connection,
          read: database.read,
        },
        blessings: {
          totalCount: database.totalCount,
          lastSavedAt: database.lastSavedAt,
          scope: 'configured_room',
        },
        notifications: {
          sseListener: hub,
        },
        scope: {
          blessingMetrics: 'shared_configured_room',
          realtimeConnections: 'current_instance_only',
        },
      };
    },
  };
}

export function readBuildInfo({ env = process.env, distDir = resolve('dist') } = {}) {
  let packageVersion;
  try { packageVersion = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version; } catch { packageVersion = null; }
  let artifact;
  try { artifact = JSON.parse(readFileSync(resolve(distDir, '.build-info.json'), 'utf8')); } catch { artifact = null; }
  const configuredCommit = text(env.APP_BUILD_COMMIT) || text(env.GIT_COMMIT);
  const configuredBuild = text(env.APP_BUILD_VERSION);
  return {
    version: text(env.APP_VERSION) || text(env.npm_package_version) || text(packageVersion) || UNKNOWN,
    build: configuredCommit || configuredBuild || text(env.BUILD_VERSION) || text(env.GIT_COMMIT) || text(artifact?.buildId) || UNKNOWN,
    buildTime: text(env.APP_BUILD_TIME) || text(artifact?.buildTime) || UNKNOWN,
    buildSource: configuredCommit ? 'configured_commit' : configuredBuild ? 'configured_build' : text(artifact?.buildSource) || UNKNOWN,
    commit: configuredCommit || text(artifact?.commit) || UNKNOWN,
  };
}

async function readBlessingStats(blessings) {
  if (!blessings) return { connection: NOT_CONFIGURED, read: NOT_CONFIGURED, totalCount: null, lastSavedAt: null };
  try {
    const stats = await blessings.store.dashboardStats();
    return {
      connection: 'connected',
      read: 'ready',
      totalCount: stats.totalCount == null ? null : String(stats.totalCount),
      lastSavedAt: stats.lastSavedAt == null ? null : dateValue(stats.lastSavedAt)?.toISOString() || UNKNOWN,
    };
  } catch (error) {
    console.error('管理后台读取祝福状态失败', error.code || error.name);
    return { connection: 'unavailable', read: 'unavailable', totalCount: null, lastSavedAt: null };
  }
}

function notificationStatus(blessings) {
  if (!blessings) return NOT_CONFIGURED;
  if (typeof blessings.hub?.status !== 'function') return UNKNOWN;
  const state = blessings.hub.status().state;
  return ['ready', 'connected', 'connecting', 'unavailable', 'stopped'].includes(state) ? state : UNKNOWN;
}

function dateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}
