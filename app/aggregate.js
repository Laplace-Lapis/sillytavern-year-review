// Pure reduction: per-character digests -> a per-year summary ready for the UI. No I/O, no
// SillyTavern API calls — this is unit-tested directly (see test/aggregate.test.js).

const ALL_YEARS_KEY = 'all';

function sortedDesc(counter) {
    return Object.entries(counter)
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => ({ key, count }));
}

/**
 * Counts distinct characters per tag from a Set of 'tagName\0avatar' pair keys.
 * @param {Set<string>} pairs
 * @returns {Record<string, number>}
 */
function countTagCharacters(pairs) {
    const counts = {};
    for (const pair of pairs) {
        const tagName = pair.slice(0, pair.indexOf('\0'));
        counts[tagName] = (counts[tagName] ?? 0) + 1;
    }
    return counts;
}

function mergeCounter(target, source) {
    for (const [key, count] of Object.entries(source ?? {})) {
        target[key] = (target[key] ?? 0) + count;
    }
}

/**
 * Converts a local YYYY-MM-DD day key into a Date at local midnight.
 * @param {string} dayKey
 * @returns {Date}
 */
function dayKeyToDate(dayKey) {
    const [year, month, day] = dayKey.split('-').map(Number);
    return new Date(year, month - 1, day);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Finds the longest run of consecutive calendar days present in a day-count map.
 * @param {Record<string, number>} dayCounts Map of 'YYYY-MM-DD' -> message count.
 * @returns {{days: number, start: string|null, end: string|null}}
 */
export function computeLongestStreak(dayCounts) {
    const keys = Object.keys(dayCounts).sort();
    if (keys.length === 0) {
        return { days: 0, start: null, end: null };
    }

    let best = { days: 1, start: keys[0], end: keys[0] };
    let runStart = keys[0];
    let runLength = 1;
    let prevDate = dayKeyToDate(keys[0]);

    for (let i = 1; i < keys.length; i++) {
        const currentDate = dayKeyToDate(keys[i]);
        const diffDays = Math.round((currentDate - prevDate) / MS_PER_DAY);
        if (diffDays === 1) {
            runLength++;
        } else {
            runStart = keys[i];
            runLength = 1;
        }
        if (runLength > best.days) {
            best = { days: runLength, start: runStart, end: keys[i] };
        }
        prevDate = currentDate;
    }

    return best;
}

/**
 * Finds the single busiest day in a day-count map.
 * @param {Record<string, number>} dayCounts
 * @returns {{day: string|null, count: number}}
 */
export function computeBusiestDay(dayCounts) {
    let best = { day: null, count: 0 };
    for (const [day, count] of Object.entries(dayCounts)) {
        if (count > best.count) {
            best = { day, count };
        }
    }
    return best;
}

/**
 * Resolves character avatar -> {name, tagNames} from the raw /characters/all and
 * /settings/get (tags, tag_map) responses.
 * @param {Array<object>} characters Response of /api/characters/all.
 * @param {Array<{id: string, name: string}>} tags settings.tags
 * @param {Record<string, string[]>} tagMap settings.tag_map
 * @returns {Map<string, {name: string, tagNames: string[]}>}
 */
export function resolveCharacterMeta(characters, tags, tagMap) {
    const tagNameById = new Map((tags ?? []).map((tag) => [tag.id, tag.name]));
    const meta = new Map();
    for (const character of characters ?? []) {
        const tagIds = tagMap?.[character.avatar] ?? [];
        const tagNames = tagIds.map((id) => tagNameById.get(id)).filter(Boolean);
        meta.set(character.avatar, { name: character.name, tagNames });
    }
    return meta;
}

function emptyYearAccumulator() {
    return {
        userMessages: 0,
        assistantMessages: 0,
        generations: 0,
        swipes: 0,
        userWords: 0,
        assistantWords: 0,
        genTimeMs: 0,
        models: {},
        apis: {},
        months: {},
        days: {},
        hours: new Array(24).fill(0),
        chatCount: 0,
        characterStats: {},
        tagCharacterPairs: new Set(),
        first: null,
        last: null,
        superlatives: {
            longestMessage: null,
            mostSwipes: null,
            longestGen: null,
            longestChat: null,
            bigWordDay: null,
        },
    };
}

function pickBetter(current, candidate, isBetter) {
    if (!candidate) {
        return current;
    }
    if (!current || isBetter(candidate, current)) {
        return candidate;
    }
    return current;
}

/**
 * Reduces per-character digests into a per-year (plus "all") summary.
 * @param {import('./cache.js').DigestFile} digest
 * @param {Map<string, {name: string, tagNames: string[]}>} characterMeta
 * @returns {object} Summary consumed by the views.
 */
export function reduceDigest(digest, characterMeta) {
    const years = {};
    const firstYearByCharacter = new Map();

    // Determine each character's first active year up front, across the whole digest, so
    // "new vs returning" is correct even though characters are processed independently below.
    for (const [avatar, charDigest] of Object.entries(digest.characters ?? {})) {
        const numericYears = Object.keys(charDigest.y ?? {})
            .filter((year) => year !== 'unknown')
            .map(Number);
        if (numericYears.length > 0) {
            firstYearByCharacter.set(avatar, Math.min(...numericYears));
        }
    }

    // Sum of each character's OWN distinct-chat count (scanner.js's chatCount, deduped
    // across that character's years already) rather than summing each year's chat count
    // below — a chat spanning a Jan 1 boundary is active in two different years, and
    // summing per-year counts would double-count it in the "all" total otherwise.
    let allTimeChatCount = 0;

    for (const [avatar, charDigest] of Object.entries(digest.characters ?? {})) {
        const meta = characterMeta.get(avatar) ?? { name: avatar, tagNames: [] };
        allTimeChatCount += charDigest.chatCount ?? 0;
        for (const [year, yearData] of Object.entries(charDigest.y ?? {})) {
            const acc = years[year] ?? (years[year] = emptyYearAccumulator());
            acc.userMessages += yearData.um ?? 0;
            acc.assistantMessages += yearData.am ?? 0;
            acc.generations += yearData.gen ?? 0;
            acc.swipes += yearData.sw ?? 0;
            acc.userWords += yearData.uw ?? 0;
            acc.assistantWords += yearData.aw ?? 0;
            acc.genTimeMs += yearData.gt ?? 0;
            mergeCounter(acc.models, yearData.mo);
            mergeCounter(acc.apis, yearData.ap);
            mergeCounter(acc.days, yearData.d);
            for (let hour = 0; hour < 24; hour++) {
                acc.hours[hour] += yearData.h?.[hour] ?? 0;
            }
            for (const [monthKey, monthData] of Object.entries(yearData.mm ?? {})) {
                const monthAcc = acc.months[monthKey] ?? (acc.months[monthKey] = { assistantMessages: 0, models: {}, apis: {} });
                monthAcc.assistantMessages += monthData.am ?? 0;
                mergeCounter(monthAcc.models, monthData.mo);
                mergeCounter(monthAcc.apis, monthData.ap);
            }
            acc.chatCount += yearData.chats ?? 0;

            const totalMessages = (yearData.um ?? 0) + (yearData.am ?? 0);
            if (totalMessages > 0) {
                const charStat = acc.characterStats[avatar] ?? (acc.characterStats[avatar] = {
                    name: meta.name, messages: 0, words: 0, chats: 0,
                });
                charStat.messages += totalMessages;
                charStat.words += (yearData.uw ?? 0) + (yearData.aw ?? 0);
                charStat.chats += yearData.chats ?? 0;

                // Count each (tag, character) pair at most once per year, even though this
                // loop runs once per year-entry (there's exactly one per character per year
                // here, but guard against future refactors that iterate differently).
                for (const tagName of meta.tagNames) {
                    acc.tagCharacterPairs.add(`${tagName}\0${avatar}`);
                }
            }

            if (yearData.first !== undefined && yearData.first !== null) {
                acc.first = acc.first === null ? yearData.first : Math.min(acc.first, yearData.first);
            }
            if (yearData.last !== undefined && yearData.last !== null) {
                acc.last = acc.last === null ? yearData.last : Math.max(acc.last, yearData.last);
            }

            const sup = yearData.sup ?? {};
            const withCharacter = (candidate) => candidate && { ...candidate, character: meta.name, avatar };
            acc.superlatives.longestMessage = pickBetter(
                acc.superlatives.longestMessage, withCharacter(sup.longestMessage),
                (a, b) => a.len > b.len,
            );
            acc.superlatives.mostSwipes = pickBetter(
                acc.superlatives.mostSwipes, withCharacter(sup.mostSwipes),
                (a, b) => a.count > b.count,
            );
            acc.superlatives.longestGen = pickBetter(
                acc.superlatives.longestGen, withCharacter(sup.longestGen),
                (a, b) => a.ms > b.ms,
            );
            acc.superlatives.longestChat = pickBetter(
                acc.superlatives.longestChat, withCharacter(sup.longestChat),
                (a, b) => a.messages > b.messages,
            );
            acc.superlatives.bigWordDay = pickBetter(
                acc.superlatives.bigWordDay, withCharacter(sup.bigWordDay),
                (a, b) => a.words > b.words,
            );
        }
    }

    // Fold everything into a synthetic "all" year, reusing the same accumulator shape.
    const allAcc = emptyYearAccumulator();
    for (const [year, acc] of Object.entries(years)) {
        allAcc.userMessages += acc.userMessages;
        allAcc.assistantMessages += acc.assistantMessages;
        allAcc.generations += acc.generations;
        allAcc.swipes += acc.swipes;
        allAcc.userWords += acc.userWords;
        allAcc.assistantWords += acc.assistantWords;
        allAcc.genTimeMs += acc.genTimeMs;
        mergeCounter(allAcc.models, acc.models);
        mergeCounter(allAcc.apis, acc.apis);
        mergeCounter(allAcc.days, acc.days);
        for (let hour = 0; hour < 24; hour++) {
            allAcc.hours[hour] += acc.hours[hour];
        }
        Object.assign(allAcc.months, acc.months);
        allAcc.chatCount += acc.chatCount;
        for (const [avatar, charStat] of Object.entries(acc.characterStats)) {
            const existing = allAcc.characterStats[avatar] ?? (allAcc.characterStats[avatar] = {
                name: charStat.name, messages: 0, words: 0, chats: 0,
            });
            existing.messages += charStat.messages;
            existing.words += charStat.words;
            existing.chats += charStat.chats;
        }
        for (const pair of acc.tagCharacterPairs) {
            allAcc.tagCharacterPairs.add(pair);
        }
        if (acc.first !== null) {
            allAcc.first = allAcc.first === null ? acc.first : Math.min(allAcc.first, acc.first);
        }
        if (acc.last !== null) {
            allAcc.last = allAcc.last === null ? acc.last : Math.max(allAcc.last, acc.last);
        }
        for (const key of Object.keys(allAcc.superlatives)) {
            const compareFns = {
                longestMessage: (a, b) => a.len > b.len,
                mostSwipes: (a, b) => a.count > b.count,
                longestGen: (a, b) => a.ms > b.ms,
                longestChat: (a, b) => a.messages > b.messages,
                bigWordDay: (a, b) => a.words > b.words,
            };
            allAcc.superlatives[key] = pickBetter(allAcc.superlatives[key], acc.superlatives[key], compareFns[key]);
        }
        void year;
    }
    // Overrides the naive per-year sum accumulated above with the deduped total (see the
    // comment where allTimeChatCount is built).
    allAcc.chatCount = allTimeChatCount;
    years[ALL_YEARS_KEY] = allAcc;

    const yearKeys = Object.keys(years)
        .filter((key) => key !== ALL_YEARS_KEY && key !== 'unknown')
        .sort((a, b) => Number(a) - Number(b));
    const hasUnknown = Object.prototype.hasOwnProperty.call(years, 'unknown');

    const byYear = {};
    for (const [year, acc] of Object.entries(years)) {
        const streak = computeLongestStreak(acc.days);
        const busiestDay = computeBusiestDay(acc.days);
        const characterList = Object.entries(acc.characterStats)
            .map(([avatar, stat]) => ({ avatar, ...stat }))
            .sort((a, b) => b.messages - a.messages);

        let newCount = 0;
        let returningCount = 0;
        if (year !== ALL_YEARS_KEY && year !== 'unknown') {
            const yearNum = Number(year);
            for (const avatar of Object.keys(acc.characterStats)) {
                if (firstYearByCharacter.get(avatar) === yearNum) {
                    newCount++;
                } else {
                    returningCount++;
                }
            }
        }

        byYear[year] = {
            totals: {
                userMessages: acc.userMessages,
                assistantMessages: acc.assistantMessages,
                messages: acc.userMessages + acc.assistantMessages,
                generations: acc.generations,
                swipes: acc.swipes,
                userWords: acc.userWords,
                assistantWords: acc.assistantWords,
                words: acc.userWords + acc.assistantWords,
                genTimeMs: acc.genTimeMs,
                activeDays: Object.keys(acc.days).length,
                chats: acc.chatCount,
                characters: characterList.length,
                newCharacters: newCount,
                returningCharacters: returningCount,
            },
            months: Object.entries(acc.months)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([month, data]) => ({ month, ...data })),
            days: acc.days,
            hours: acc.hours,
            longestStreak: streak,
            busiestDay,
            characters: characterList,
            models: sortedDesc(acc.models),
            apis: sortedDesc(acc.apis),
            tags: sortedDesc(countTagCharacters(acc.tagCharacterPairs)),
            firstMessageMs: acc.first,
            lastMessageMs: acc.last,
            superlatives: acc.superlatives,
        };
    }

    return {
        years: yearKeys,
        hasUnknown,
        byYear,
    };
}
