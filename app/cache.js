// Persistence for the scan cache, via SillyTavern's per-user Files API
// (POST /api/files/upload -> <DATA_ROOT>/<user>/user/files/<name>, GET /user/files/<name> to
// read it back). Deliberately NOT using extension_settings: that blob is re-serialized and
// backed up on every saveSettingsDebounced() call, and this cache can run to a few MB.

import { readUserFile, writeUserFile, deleteUserFile } from './api.js';

export const CACHE_VERSION = 1;

const DIGEST_FILE = '_yr_digest.json';
const SUMMARY_FILE = '_yr_summary.json';

/**
 * @typedef {Object} DigestFile
 * @property {number} version
 * @property {Record<string, CharacterDigest>} characters Keyed by character avatar filename.
 */

/**
 * Loads the per-character digest file. Returns an empty, current-version digest if none
 * exists yet, or if the stored version doesn't match (schema changes always force a full
 * rebuild rather than trying to migrate).
 * @returns {Promise<DigestFile>}
 */
export async function loadDigest() {
    const data = await readUserFile(DIGEST_FILE);
    if (!data || data.version !== CACHE_VERSION || typeof data.characters !== 'object') {
        return { version: CACHE_VERSION, characters: {} };
    }
    return data;
}

// Writes are serialized: a save triggered while one is already in flight queues instead of
// racing it, matching the pattern used by CharacterLibrary's modules/playlists.js.
let digestSaving = null;
let digestSaveQueued = null;

/**
 * Persists the digest file, serializing concurrent calls.
 * @param {DigestFile} digest
 * @returns {Promise<void>}
 */
export async function saveDigest(digest) {
    if (digestSaving) {
        digestSaveQueued = digest;
        return digestSaving;
    }
    digestSaving = writeUserFile(DIGEST_FILE, digest).finally(() => {
        digestSaving = null;
        if (digestSaveQueued) {
            const next = digestSaveQueued;
            digestSaveQueued = null;
            saveDigest(next);
        }
    });
    return digestSaving;
}

/**
 * Loads the reduced year-summary file (small, safe to load on every tab open).
 * @returns {Promise<object|null>}
 */
export async function loadSummary() {
    const data = await readUserFile(SUMMARY_FILE);
    if (!data || data.version !== CACHE_VERSION) {
        return null;
    }
    return data;
}

/**
 * Persists the reduced year-summary file.
 * @param {object} summary
 * @returns {Promise<void>}
 */
export async function saveSummary(summary) {
    await writeUserFile(SUMMARY_FILE, { ...summary, version: CACHE_VERSION });
}

/**
 * Deletes both cache files. Used by the "Clear cache" settings button.
 * @returns {Promise<void>}
 */
export async function clearCache() {
    await Promise.all([
        deleteUserFile(DIGEST_FILE),
        deleteUserFile(SUMMARY_FILE),
    ]);
}
