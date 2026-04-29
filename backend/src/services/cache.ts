/**
 * cache.ts — Service de cache partagé (Redis avec fallback in-memory)
 *
 * Pourquoi Redis ?
 *   En mode PM2 Cluster (plusieurs workers), chaque process Node.js a sa propre
 *   mémoire. Un cache in-process devient incohérent : un worker peut servir des
 *   données périmées alors qu'un autre vient d'invalider son propre cache.
 *   Redis est un processus unique partagé par tous les workers → cohérence garantie.
 *
 * Fallback in-memory :
 *   Si Redis n'est pas disponible (dev sans Redis, VPS en panne…), le service
 *   déggrade silencieusement vers le Map in-memory. L'app continue de fonctionner,
 *   juste sans partage inter-workers.
 */

import Redis from 'ioredis';

// ─── Redis connection (lazy, reconnect automatique) ───────────────────────────

let _redis: Redis | null = null;
let _redisHealthy = true;

function getRedisClient(): Redis | null {
  // Si Redis a échoué récemment, ne pas retenter tout de suite
  if (!_redisHealthy) return null;

  if (_redis) return _redis;

  try {
    _redis = new Redis({
      host:               process.env.REDIS_HOST     || '127.0.0.1',
      port:               parseInt(process.env.REDIS_PORT || '6379', 10),
      password:           process.env.REDIS_PASSWORD || undefined,
      db:                 0,
      // Délais agressifs pour ne pas bloquer les requêtes si Redis est lent
      connectTimeout:     3_000,
      commandTimeout:     2_000,
      // Pas de file d'attente : si Redis est down, échouer immédiatement
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });

    _redis.on('connect', () => {
      _redisHealthy = true;
      console.log('[cache] ✅ Redis connecté');
    });

    _redis.on('error', (err: Error) => {
      // On ne spam pas les logs — juste un avertissement
      if (_redisHealthy) {
        console.warn('[cache] ⚠️  Redis indisponible — fallback in-memory activé:', err.message);
      }
      _redisHealthy = false;
      _redis = null;
    });

    return _redis;
  } catch (err) {
    console.warn('[cache] ⚠️  Impossible de créer le client Redis:', (err as Error).message);
    _redisHealthy = false;
    return null;
  }
}

// ─── Fallback in-memory (Map simple avec TTL) ─────────────────────────────────

const _mem = new Map<string, { v: string; exp: number }>();

function memGet<T>(key: string): T | null {
  const e = _mem.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) { _mem.delete(key); return null; }
  return JSON.parse(e.v) as T;
}

function memSet(key: string, data: unknown, ttlMs: number): void {
  _mem.set(key, { v: JSON.stringify(data), exp: Date.now() + ttlMs });
  // Limiter la taille pour éviter les fuites mémoire
  if (_mem.size > 500) {
    const oldest = _mem.keys().next().value;
    if (oldest !== undefined) _mem.delete(oldest);
  }
}

function memDeletePattern(pattern: string): void {
  // Convertit "res:*" en préfixe "res:"
  const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern;
  for (const k of _mem.keys()) {
    if (k.startsWith(prefix)) _mem.delete(k);
  }
}

// ─── API publique ─────────────────────────────────────────────────────────────

export const CACHE_TTL_S = 30; // TTL par défaut : 30 secondes

/**
 * Lire une valeur depuis le cache.
 * Retourne null si absente ou expirée.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (client) {
    try {
      const val = await client.get(key);
      return val ? (JSON.parse(val) as T) : null;
    } catch { /* Redis down → fallback */ }
  }
  return memGet<T>(key);
}

/**
 * Écrire une valeur dans le cache.
 * @param ttlSeconds  Durée de vie en secondes (défaut: 30s)
 */
export async function cacheSet(key: string, data: unknown, ttlSeconds = CACHE_TTL_S): Promise<void> {
  const client = getRedisClient();
  if (client) {
    try {
      await client.setex(key, ttlSeconds, JSON.stringify(data));
      return;
    } catch { /* Redis down → fallback */ }
  }
  memSet(key, data, ttlSeconds * 1_000);
}

/**
 * Supprimer toutes les clés correspondant à un pattern glob (ex: "res:list:*").
 * En fallback mémoire, seul le préfixe avant '*' est utilisé.
 */
export async function cacheDeletePattern(pattern: string): Promise<void> {
  const client = getRedisClient();
  if (client) {
    try {
      // KEYS est bloquant — acceptable sur un VPS mono-instance avec peu de clés.
      // À remplacer par SCAN si le nombre de clés dépasse ~10 000.
      const keys = await client.keys(pattern);
      if (keys.length > 0) await client.del(...keys);
      return;
    } catch { /* Redis down → fallback */ }
  }
  memDeletePattern(pattern);
}

/**
 * Fermer proprement la connexion Redis (appelé lors du graceful shutdown).
 */
export async function closeCacheClient(): Promise<void> {
  if (_redis) {
    try {
      await _redis.quit();
    } catch { /* ignore */ }
    _redis = null;
  }
}
