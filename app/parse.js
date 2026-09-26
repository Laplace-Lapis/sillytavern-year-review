// Pure, dependency-free parsing helpers used by the scanner. No SillyTavern API calls here,
// no DOM — this file is unit-tested directly (see test/parse.test.js).

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

// ST "humanized" timestamp forms, e.g. "2024-07-12@01h31m37s123ms", "2024-6-5 @14h 56m 50s 682ms".
const HUMANIZED_PATTERNS = [
    /(\d{4})-(\d{1,2})-(\d{1,2})@(\d{1,2})h(\d{1,2})m(\d{1,2})s(\d{1,3})ms/,
    /(\d{4})-(\d{1,2})-(\d{1,2})@(\d{1,2})h(\d{1,2})m(\d{1,2})s/,
    /(\d{4})-(\d{1,2})-(\d{1,2}) @(\d{1,2})h (\d{1,2})m (\d{1,2})s (\d{1,3})ms/,
];

// "June 19, 2023 2:20pm"
const MERIDIEM_PATTERN = /(\w+)\s(\d{1,2}),\s(\d{4})\s(\d{1,2}):(\d{1,2})(am|pm)/i;

function pad(value, length = 2) {
    return String(value).padStart(length, '0');
}

/**
 * Converts a chat message timestamp into milliseconds since the Unix epoch, or null if it
 * cannot be parsed.
 *
 * Ported from src/endpoints/stats.js's parseTimestamp, with one deliberate change: core's
 * version treats the ST "humanized" legacy format as UTC (appending 'Z') but the meridiem
 * legacy format as local time — an inconsistency that shifts year boundaries differently
 * depending on which legacy format a chat happens to use. Both are local wall-clock time in
 * practice (produced by the client with no timezone info), so both are parsed as local here
 * for internal consistency. Only the modern ISO-8601-with-Z format is treated as UTC, because
 * that's what the client actually writes (see public/scripts/RossAscends-mods.js
 * getMessageTimeStamp).
 *
 * @param {string|number|Date|undefined|null} timestamp
 * @returns {number|null} Milliseconds since epoch, or null if unparseable.
 */
export function parseTimestamp(timestamp) {
    if (timestamp === undefined || timestamp === null || timestamp === '') {
        return null;
    }

    if (timestamp instanceof Date) {
        const time = timestamp.getTime();
        return Number.isFinite(time) ? time : null;
    }

    if (typeof timestamp === 'number' || /^\d+$/.test(String(timestamp))) {
        const unixTime = Number(timestamp);
        if (!Number.isFinite(unixTime) || unixTime < 0) {
            return null;
        }
        return unixTime;
    }

    const str = String(timestamp);

    if (ISO_PATTERN.test(str)) {
        const time = new Date(str).getTime();
        return Number.isFinite(time) ? time : null;
    }

    for (const pattern of HUMANIZED_PATTERNS) {
        const match = str.match(pattern);
        if (!match) {
            continue;
        }
        const [, year, month, day, hour, minute, second, ms] = match;
        const isoLocal = `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}${ms ? `.${pad(ms, 3)}` : ''}`;
        const time = new Date(isoLocal).getTime();
        if (Number.isFinite(time)) {
            return time;
        }
    }

    const meridiemMatch = str.match(MERIDIEM_PATTERN);
    if (meridiemMatch) {
        const [, month, day, year, hour, minute, meridiem] = meridiemMatch;
        const monthIndex = MONTH_NAMES.findIndex((name) => name.toLowerCase() === month.toLowerCase());
        if (monthIndex !== -1) {
            const hour24 = meridiem.toLowerCase() === 'pm' ? (parseInt(hour, 10) % 12) + 12 : parseInt(hour, 10) % 12;
            const isoLocal = `${pad(year, 4)}-${pad(monthIndex + 1)}-${pad(day)}T${pad(hour24)}:${pad(minute)}:00`;
            const time = new Date(isoLocal).getTime();
            if (Number.isFinite(time)) {
                return time;
            }
        }
    }

    return null;
}

/**
 * Counts words in a message string the same way core does (matches \b\w+\b runs).
 * @param {string} text
 * @returns {number}
 */
export function countWords(text) {
    if (!text) {
        return 0;
    }
    const matches = text.match(/\b\w+\b/g);
    return matches ? matches.length : 0;
}

/**
 * A small, fast, non-cryptographic hash (FNV-1a, 32-bit) used only for branch-duplicate
 * detection — collisions are acceptable to leave undetected (they just mean two branches
 * of an unlikely-identical message aren't deduped), not for security.
 * @param {string} text
 * @returns {number} Unsigned 32-bit hash.
 */
export function fnv1a(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/**
 * Builds a dedupe key for a message within one character's chat history. Branch/bookmark
 * copies carry the same send_date and mes verbatim, so they collide exactly; two distinct
 * messages sent in the same millisecond with the same length and hash are astronomically
 * unlikely to collide in practice for this purpose.
 * @param {string|number|undefined} sendDate Raw send_date field, unparsed.
 * @param {string} mes Message text.
 * @returns {string}
 */
export function dedupeKey(sendDate, mes) {
    return `${sendDate ?? ''}\0${mes.length}\0${fnv1a(mes)}`;
}

/**
 * Returns the calendar year (local time) for a parsed millisecond timestamp.
 * @param {number} ms
 * @returns {number}
 */
export function yearOf(ms) {
    return new Date(ms).getFullYear();
}

/**
 * Returns the local YYYY-MM-DD date key for a parsed millisecond timestamp.
 * @param {number} ms
 * @returns {string}
 */
export function dayKeyOf(ms) {
    const date = new Date(ms);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Returns the local YYYY-MM month key for a parsed millisecond timestamp.
 * @param {number} ms
 * @returns {string}
 */
export function monthKeyOf(ms) {
    const date = new Date(ms);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/**
 * Returns the local hour-of-day (0-23) for a parsed millisecond timestamp.
 * @param {number} ms
 * @returns {number}
 */
export function hourOf(ms) {
    return new Date(ms).getHours();
}

/**
 * Normalizes a raw extra.model value. For kobold/textgen APIs this field is actually
 * `online_status`, which can be a connection-status string rather than a model id (see
 * getGeneratingModel in public/script.js). Known junk values collapse to null so callers
 * can bucket them as "unknown" instead of charting them as if they were real model names.
 * @param {string|undefined} rawModel
 * @returns {string|null}
 */
export function normalizeModel(rawModel) {
    if (!rawModel || typeof rawModel !== 'string') {
        return null;
    }
    const trimmed = rawModel.trim();
    if (!trimmed || trimmed === 'no_connection' || trimmed === 'undefined') {
        return null;
    }
    return trimmed;
}

/**
 * Normalizes a raw extra.api value to a non-empty string or null.
 * @param {string|undefined} rawApi
 * @returns {string|null}
 */
export function normalizeApi(rawApi) {
    if (!rawApi || typeof rawApi !== 'string') {
        return null;
    }
    const trimmed = rawApi.trim();
    return trimmed || null;
}

/**
 * @typedef {Object} GenerationEvent
 * @property {string|null} api Normalized extra.api, or null for unknown.
 * @property {string|null} model Normalized extra.model, or null for unknown.
 * @property {number|null} genTimeMs Wall-clock generation time in ms, or null if not recorded.
 */

/**
 * Breaks one assistant message down into its individual generation events — one per swipe,
 * including the swipe that was kept. This is the granularity providers were actually billed
 * at, which is what "count all swipes as generations" (the chosen design) needs.
 *
 * Precision note: `swipe_info` (per-swipe attribution) is only populated from the message
 * onward that ensureSwipes() first ran on; older/backfilled swipes have `extra: {}}` and land
 * in the unknown bucket via normalizeApi/normalizeModel returning null. When swipe_info is
 * entirely absent but `swipes` isn't (very old chats), there is no per-swipe attribution at
 * all, so every swipe is attributed to the kept message's own extra as the closest available
 * proxy, and no genTimeMs is fabricated for the swipes that aren't the kept one.
 *
 * @param {object} message A single chat message object (not the header).
 * @returns {GenerationEvent[]} At least one entry for any non-system, non-user message.
 */
export function extractGenerationEvents(message) {
    const keptApi = normalizeApi(message.extra?.api);
    const keptModel = normalizeModel(message.extra?.model);
    const keptGenTime = genTimeMs(message.gen_started, message.gen_finished);

    if (Array.isArray(message.swipe_info) && message.swipe_info.length > 0) {
        return message.swipe_info.map((swipe) => ({
            api: normalizeApi(swipe?.extra?.api),
            model: normalizeModel(swipe?.extra?.model),
            genTimeMs: genTimeMs(swipe?.gen_started, swipe?.gen_finished),
        }));
    }

    const swipeCount = Array.isArray(message.swipes) ? message.swipes.length : 1;
    const count = Math.max(1, swipeCount);
    const events = [];
    for (let i = 0; i < count; i++) {
        // Only the kept swipe's own timing is real; don't fabricate timing for the others.
        events.push({ api: keptApi, model: keptModel, genTimeMs: i === 0 ? keptGenTime : null });
    }
    return events;
}

/**
 * Computes the wall-clock generation time between gen_started and gen_finished, or null if
 * either is missing/unparseable or the result would be negative.
 * @param {string|number|Date|undefined} genStarted
 * @param {string|number|Date|undefined} genFinished
 * @returns {number|null}
 */
export function genTimeMs(genStarted, genFinished) {
    if (!genStarted || !genFinished) {
        return null;
    }
    const start = parseTimestamp(genStarted);
    const end = parseTimestamp(genFinished);
    if (start === null || end === null) {
        return null;
    }
    const delta = end - start;
    return delta >= 0 ? delta : null;
}
