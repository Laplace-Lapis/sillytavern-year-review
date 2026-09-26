// Orchestrates the scan: inventory -> diff against the cached digest -> fan out reads for
// changed characters only -> reduce to a year summary -> persist both.

import { fetchAllChats, fetchAllCharacters, fetchUserSettings, fetchChatData } from './api.js';
import { loadDigest, saveDigest, saveSummary } from './cache.js';
import {
    parseTimestamp, countWords, dedupeKey, yearOf, dayKeyOf, monthKeyOf, hourOf,
    extractGenerationEvents,
} from './parse.js';
import { reduceDigest, resolveCharacterMeta } from './aggregate.js';

const UNKNOWN_YEAR = 'unknown';

/**
 * Builds the current signature for one character's chats: enough info from the cheap
 * /chats/recent inventory to detect that a chat changed, without reading its contents.
 * @param {Array<object>} chatEntries Entries from /chats/recent for one avatar.
 * @returns {Record<string, [number, number|string, string]>}
 */
function buildSignature(chatEntries) {
    const sig = {};
    for (const entry of chatEntries) {
        sig[entry.file_id] = [entry.chat_items, entry.last_mes, entry.file_size];
    }
    return sig;
}

function signaturesEqual(a, b) {
    if (!a || !b) {
        return false;
    }
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) {
        return false;
    }
    for (const key of aKeys) {
        const av = a[key];
        const bv = b[key];
        if (!bv || av[0] !== bv[0] || av[1] !== bv[1] || av[2] !== bv[2]) {
            return false;
        }
    }
    return true;
}

/**
 * Fetches the full inventory needed to plan a scan: every chat file (grouped by owning
 * character), every character record, and the tag data.
 * @param {AbortSignal} [signal]
 */
async function fetchInventory(signal) {
    const [allChats, characters, settingsResponse] = await Promise.all([
        fetchAllChats(signal),
        fetchAllCharacters(signal),
        fetchUserSettings(signal),
    ]);

    // /api/settings/get returns the whole settings.json file as a raw STRING under
    // `settings` (see src/endpoints/settings.js: `fs.readFileSync(path, 'utf8')` passed
    // through untouched) — it is not pre-parsed like the rest of the response's fields.
    let settings = {};
    try {
        settings = JSON.parse(settingsResponse?.settings ?? '{}');
    } catch (error) {
        console.error('[Year Review] Failed to parse settings.json response', error);
    }

    const chatsByAvatar = new Map();
    let groupChatCount = 0;
    let looseChatCount = 0;
    for (const chat of Array.isArray(allChats) ? allChats : []) {
        if (chat.avatar) {
            const list = chatsByAvatar.get(chat.avatar) ?? [];
            list.push(chat);
            chatsByAvatar.set(chat.avatar, list);
        } else if (chat.group) {
            groupChatCount++;
        } else {
            looseChatCount++;
        }
    }

    return {
        chatsByAvatar,
        characters: Array.isArray(characters) ? characters : [],
        tags: settings?.tags ?? [],
        tagMap: settings?.tag_map ?? {},
        groupChatCount,
        looseChatCount,
    };
}

function emptyYearBucket() {
    return {
        um: 0, am: 0, gen: 0, uw: 0, aw: 0, sw: 0, gt: 0,
        mo: {}, ap: {}, mm: {}, d: {}, h: new Array(24).fill(0),
        first: null, last: null,
        chats: 0,
        sup: { longestMessage: null, mostSwipes: null, longestGen: null, longestChat: null, bigWordDay: null },
    };
}

function bump(counter, key) {
    const safeKey = key ?? 'unknown';
    counter[safeKey] = (counter[safeKey] ?? 0) + 1;
}

function betterOf(current, candidate, isBetter) {
    if (!current) {
        return candidate;
    }
    return isBetter(candidate, current) ? candidate : current;
}

/**
 * Rebuilds the digest entry for a single character from scratch, reading every one of its
 * chat files. Cancellable via `signal` — checked after every await so an abort mid-character
 * doesn't burn extra requests.
 * @param {string} avatar Character avatar filename ('<name>.png').
 * @param {Array<object>} chatEntries This character's entries from /chats/recent.
 * @param {AbortSignal} [signal]
 * @returns {Promise<{sig: object, y: object}>}
 */
async function rebuildCharacterDigest(avatar, chatEntries, signal) {
    const sig = buildSignature(chatEntries);
    const years = {};
    // Deterministic (not necessarily chronological) order, so re-running an unchanged scan
    // dedupes identically; that's all "stable order" needs to guarantee here.
    const orderedChats = [...chatEntries].sort((a, b) => a.file_id.localeCompare(b.file_id));

    // Cleared between characters on purpose: branch/bookmark duplicates only need dedup
    // within one character's own chat history, and a fresh Set per character keeps memory
    // bounded regardless of how many characters are being rescanned.
    const seen = new Set();
    // Ephemeral per-character-year day->word-count and chat->message-count maps, used only
    // to derive the "biggest word day" and "longest chat" superlatives; not persisted.
    const dayWordsByYear = new Map();
    const chatMessagesByYear = new Map();

    for (const entry of orderedChats) {
        if (signal?.aborted) {
            throw new DOMException('Scan cancelled', 'AbortError');
        }

        let chatData;
        try {
            chatData = await fetchChatData(avatar, entry.file_id, signal);
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw error;
            }
            console.error(`[Year Review] Failed to read chat ${avatar}/${entry.file_id}`, error);
            continue;
        }
        if (signal?.aborted) {
            throw new DOMException('Scan cancelled', 'AbortError');
        }
        if (!Array.isArray(chatData) || chatData.length <= 1) {
            continue;
        }

        // Element 0 is always the chat header (chat_metadata), never a message.
        const messages = chatData.slice(1);

        for (const message of messages) {
            if (!message || message.is_system) {
                continue;
            }
            const mes = typeof message.mes === 'string' ? message.mes : '';
            const key = dedupeKey(message.send_date, mes);
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);

            let ms = parseTimestamp(message.send_date);
            if (ms === null) {
                ms = parseTimestamp(message.gen_finished);
            }
            if (ms === null) {
                ms = parseTimestamp(entry.last_mes);
            }
            const year = ms !== null ? String(yearOf(ms)) : UNKNOWN_YEAR;

            const bucket = years[year] ?? (years[year] = emptyYearBucket());
            const wordCount = countWords(mes);
            // Computed once per assistant message and reused below for the monthly series,
            // rather than re-derived — extractGenerationEvents does real work per swipe.
            const events = message.is_user ? null : extractGenerationEvents(message);

            if (message.is_user) {
                bucket.um++;
                bucket.uw += wordCount;
            } else {
                bucket.am++;
                bucket.aw += wordCount;

                bucket.gen += events.length;
                bucket.sw += Math.max(0, events.length - 1);
                for (const event of events) {
                    bump(bucket.mo, event.model);
                    bump(bucket.ap, event.api);
                    if (event.genTimeMs !== null) {
                        bucket.gt += event.genTimeMs;
                    }
                }

                const longestGenEvent = events.reduce(
                    (best, event) => (event.genTimeMs !== null && (!best || event.genTimeMs > best.genTimeMs) ? event : best),
                    null,
                );
                if (longestGenEvent) {
                    bucket.sup.longestGen = betterOf(
                        bucket.sup.longestGen,
                        { ms: longestGenEvent.genTimeMs, date: ms, chat: entry.file_name },
                        (a, b) => a.ms > b.ms,
                    );
                }

                const swipeExtra = Math.max(0, events.length - 1);
                if (swipeExtra > 0) {
                    bucket.sup.mostSwipes = betterOf(
                        bucket.sup.mostSwipes,
                        { count: swipeExtra, date: ms, chat: entry.file_name },
                        (a, b) => a.count > b.count,
                    );
                }
            }

            bucket.sup.longestMessage = betterOf(
                bucket.sup.longestMessage,
                { len: mes.length, date: ms, chat: entry.file_name, role: message.is_user ? 'user' : 'assistant' },
                (a, b) => a.len > b.len,
            );

            if (ms !== null) {
                bucket.first = bucket.first === null ? ms : Math.min(bucket.first, ms);
                bucket.last = bucket.last === null ? ms : Math.max(bucket.last, ms);
                const dayKey = dayKeyOf(ms);
                bucket.d[dayKey] = (bucket.d[dayKey] ?? 0) + 1;
                bucket.h[hourOf(ms)]++;

                const monthKey = monthKeyOf(ms);
                const monthBucket = bucket.mm[monthKey] ?? (bucket.mm[monthKey] = { am: 0, mo: {}, ap: {} });
                if (events) {
                    monthBucket.am++;
                    for (const event of events) {
                        bump(monthBucket.mo, event.model);
                        bump(monthBucket.ap, event.api);
                    }
                }

                const yearWords = dayWordsByYear.get(year) ?? new Map();
                yearWords.set(dayKey, (yearWords.get(dayKey) ?? 0) + wordCount);
                dayWordsByYear.set(year, yearWords);
            }

            const yearChats = chatMessagesByYear.get(year) ?? new Map();
            yearChats.set(entry.file_id, (yearChats.get(entry.file_id) ?? 0) + 1);
            chatMessagesByYear.set(year, yearChats);
        }
    }

    // Finalize the derived superlatives and per-year chat counts from the ephemeral maps.
    for (const [year, bucket] of Object.entries(years)) {
        const yearChats = chatMessagesByYear.get(year);
        if (yearChats) {
            bucket.chats = yearChats.size;
            let bestChat = null;
            for (const [fileId, count] of yearChats) {
                if (!bestChat || count > bestChat.messages) {
                    bestChat = { messages: count, chat: fileId };
                }
            }
            bucket.sup.longestChat = bestChat;
        }

        const yearWords = dayWordsByYear.get(year);
        if (yearWords) {
            let bestDay = null;
            for (const [day, words] of yearWords) {
                if (!bestDay || words > bestDay.words) {
                    bestDay = { day, words };
                }
            }
            bucket.sup.bigWordDay = bestDay;
        }
    }

    return { sig, y: years };
}

/**
 * Runs a bounded-concurrency pool over `items`, calling `worker` for each. Stops launching
 * new work (but lets in-flight work settle) once `signal` is aborted.
 * @template T
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<void>} worker
 * @param {number} concurrency
 * @param {AbortSignal} [signal]
 */
async function runPool(items, worker, concurrency, signal) {
    let nextIndex = 0;
    const runners = new Array(Math.min(concurrency, items.length) || 0).fill(null).map(async () => {
        while (nextIndex < items.length) {
            if (signal?.aborted) {
                return;
            }
            const index = nextIndex++;
            await worker(items[index], index);
        }
    });
    await Promise.all(runners);
}

/**
 * @typedef {Object} ScanProgress
 * @property {'inventory'|'scanning'|'reducing'|'saving'|'done'} phase
 * @property {number} done
 * @property {number} total
 * @property {string} [currentCharacter]
 */

/**
 * Runs a full scan: inventory, diff against the cached digest, fan out reads for changed
 * characters, reduce, and persist. Returns the reduced summary.
 * @param {object} options
 * @param {number} [options.concurrency]
 * @param {AbortSignal} [options.signal]
 * @param {(progress: ScanProgress) => void} [options.onProgress]
 * @returns {Promise<object>} The reduced year summary.
 */
export async function runScan({ concurrency = 6, signal, onProgress } = {}) {
    const report = (progress) => onProgress?.(progress);

    report({ phase: 'inventory', done: 0, total: 0 });
    const inventory = await fetchInventory(signal);
    const digest = await loadDigest();

    const currentAvatars = new Set(inventory.characters.map((c) => c.avatar));
    for (const avatar of Object.keys(digest.characters)) {
        if (!currentAvatars.has(avatar)) {
            delete digest.characters[avatar];
        }
    }

    const workList = [];
    for (const character of inventory.characters) {
        const chatEntries = inventory.chatsByAvatar.get(character.avatar) ?? [];
        const currentSig = buildSignature(chatEntries);
        const cached = digest.characters[character.avatar];
        if (!signaturesEqual(cached?.sig, currentSig)) {
            workList.push({ avatar: character.avatar, chatEntries });
        }
    }

    let done = 0;
    report({ phase: 'scanning', done, total: workList.length });

    await runPool(workList, async ({ avatar, chatEntries }) => {
        if (signal?.aborted) {
            return;
        }
        try {
            const result = await rebuildCharacterDigest(avatar, chatEntries, signal);
            digest.characters[avatar] = result;
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw error;
            }
            console.error(`[Year Review] Failed to scan character ${avatar}`, error);
        }
        done++;
        report({ phase: 'scanning', done, total: workList.length, currentCharacter: avatar });
    }, concurrency, signal);

    if (signal?.aborted) {
        throw new DOMException('Scan cancelled', 'AbortError');
    }

    report({ phase: 'reducing', done: 0, total: 1 });
    const characterMeta = resolveCharacterMeta(inventory.characters, inventory.tags, inventory.tagMap);
    const summary = reduceDigest(digest, characterMeta);
    summary.groupChatCount = inventory.groupChatCount;
    summary.looseChatCount = inventory.looseChatCount;
    summary.scannedAt = Date.now();

    report({ phase: 'saving', done: 0, total: 1 });
    await saveDigest(digest);
    await saveSummary(summary);

    report({ phase: 'done', done: workList.length, total: workList.length });
    return summary;
}
