// Backend API wrapper for the standalone Year Review page.
//
// This page runs in its own document (a separate browser tab), not inside SillyTavern's
// module graph, so it cannot import ST's frontend modules and must talk to the backend
// over plain fetch(). See CLAUDE.md "Deviations from the extension guidelines".

const API_BASE = '/api';

let csrfToken = null;

function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
}

/**
 * Reaches back into the SillyTavern window that opened this tab, if any. Used only as a
 * best-effort fast path (e.g. to avoid one round-trip for the CSRF token) — every feature
 * must keep working with no opener at all (bookmarked tab, opener closed, restart).
 * @returns {Window|null}
 */
function getHostWindow() {
    try {
        if (window.opener && !window.opener.closed) {
            return window.opener;
        }
    } catch {
        // Cross-origin or inaccessible; ignore.
    }
    return null;
}

/**
 * Obtains a CSRF token for this page's own session. The query param passed by index.js is
 * used as a fast path when present and fresh; otherwise (or on failure) this page fetches
 * its own token directly, which works even with no opener (bookmarked reload).
 * @returns {Promise<string>}
 */
export async function getCsrfToken() {
    if (csrfToken) {
        return csrfToken;
    }
    const fromQuery = getQueryParam('csrf');
    if (fromQuery) {
        csrfToken = fromQuery;
        return csrfToken;
    }
    const response = await fetch('/csrf-token');
    if (!response.ok) {
        throw new Error(`Failed to obtain CSRF token: ${response.status}`);
    }
    const data = await response.json();
    csrfToken = data.token;
    return csrfToken;
}

/**
 * Sends a JSON POST request to a SillyTavern API endpoint.
 * @param {string} endpoint Path under /api, e.g. '/chats/recent'.
 * @param {object} [payload] Request body, JSON-serialized.
 * @param {object} [options] Extra fetch options (e.g. signal).
 * @returns {Promise<Response>}
 */
export async function apiRequest(endpoint, payload = {}, options = {}) {
    const token = await getCsrfToken();
    return fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': token,
        },
        body: JSON.stringify(payload),
        ...options,
    });
}

/**
 * Fetches a JSON response, throwing with useful context on failure.
 * @param {string} endpoint Path under /api.
 * @param {object} [payload] Request body.
 * @param {object} [options] Extra fetch options.
 * @returns {Promise<any>}
 */
export async function apiRequestJson(endpoint, payload = {}, options = {}) {
    const response = await apiRequest(endpoint, payload, options);
    if (!response.ok) {
        throw new Error(`${endpoint} failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

/**
 * Reads a user-namespaced file previously written via /api/files/upload.
 * @param {string} name File name (no path).
 * @returns {Promise<any|null>} Parsed JSON, or null if the file doesn't exist / is empty.
 */
export async function readUserFile(name) {
    const response = await fetch(`/user/files/${encodeURIComponent(name)}`, { cache: 'no-store' });
    if (!response.ok) {
        return null;
    }
    const text = await response.text();
    if (!text || !text.trim()) {
        return null;
    }
    try {
        return JSON.parse(text);
    } catch (error) {
        console.error(`[Year Review] Failed to parse user file ${name}`, error);
        return null;
    }
}

/**
 * Writes a JSON object to a user-namespaced file via /api/files/upload.
 * @param {string} name File name (no path), must end in .json.
 * @param {any} data Value to serialize and write.
 * @returns {Promise<void>}
 */
export async function writeUserFile(name, data) {
    const json = JSON.stringify(data);
    const base64 = utf8ToBase64(json);
    const response = await apiRequest('/files/upload', { name, data: base64 });
    if (!response.ok) {
        throw new Error(`Failed to write ${name}: ${response.status}`);
    }
}

/**
 * Deletes a user-namespaced file previously written via /api/files/upload.
 * @param {string} name File name (no path).
 * @returns {Promise<void>}
 */
export async function deleteUserFile(name) {
    await apiRequest('/files/delete', { path: `user/files/${name}` });
}

function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

/**
 * Notifies the host SillyTavern window of something, best-effort with a timeout. Never
 * throws; the standalone page must work fully with no host window present.
 * @param {string} type Message type, namespaced under 'year-review'.
 * @param {object} [value] Payload.
 */
export async function notifyHost(type, value = {}) {
    const host = getHostWindow();
    if (!host) {
        return;
    }
    try {
        await Promise.race([
            Promise.resolve(host.postMessage({ source: 'year-review', type, value }, window.location.origin)),
            new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
    } catch {
        // Best-effort only.
    }
}

// -- Inventory endpoints --------------------------------------------------

/** Fetches every chat file in the account (character + group + loose), with metadata. */
export function fetchAllChats(signal) {
    return apiRequestJson('/chats/recent', { metadata: true }, { signal });
}

/** Fetches every character (full records; shallow mode is a server config choice). */
export function fetchAllCharacters(signal) {
    return apiRequestJson('/characters/all', {}, { signal });
}

/**
 * Fetches user settings. NOTE: the response's `settings` field is the raw settings.json
 * file contents as a STRING (src/endpoints/settings.js reads it with fs.readFileSync and
 * passes it through unparsed) — callers must JSON.parse(response.settings) themselves to
 * reach `tags` / `tag_map`. Every other field on the response is pre-parsed; this one isn't.
 */
export function fetchUserSettings(signal) {
    return apiRequestJson('/settings/get', {}, { signal });
}

/**
 * Fetches the full parsed contents (header + messages) of one character chat file.
 * @param {string} avatarUrl Character avatar filename, with '.png' (from /chats/recent's `avatar`).
 * @param {string} fileId Chat file id *without* the '.jsonl' extension (from /chats/recent's
 *   `file_id`, not `file_name` — the server appends '.jsonl' itself).
 */
export function fetchChatData(avatarUrl, fileId, signal) {
    return apiRequestJson('/chats/get', { ch_name: '', avatar_url: avatarUrl, file_name: fileId }, { signal });
}
