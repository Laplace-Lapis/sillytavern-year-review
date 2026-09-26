import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduceDigest, resolveCharacterMeta, computeLongestStreak, computeBusiestDay } from '../app/aggregate.js';

test('computeLongestStreak: finds the longest run of consecutive days', () => {
    const days = {
        '2024-01-01': 3, '2024-01-02': 1, '2024-01-03': 2,
        '2024-01-10': 5, '2024-01-11': 1,
        '2024-01-05': 1,
    };
    const streak = computeLongestStreak(days);
    assert.equal(streak.days, 3);
    assert.equal(streak.start, '2024-01-01');
    assert.equal(streak.end, '2024-01-03');
});

test('computeLongestStreak: crosses a month boundary correctly', () => {
    const days = { '2024-01-30': 1, '2024-01-31': 1, '2024-02-01': 1, '2024-02-02': 1 };
    const streak = computeLongestStreak(days);
    assert.equal(streak.days, 4);
    assert.equal(streak.start, '2024-01-30');
    assert.equal(streak.end, '2024-02-02');
});

test('computeLongestStreak: empty input', () => {
    assert.deepEqual(computeLongestStreak({}), { days: 0, start: null, end: null });
});

test('computeBusiestDay: finds the max', () => {
    const days = { '2024-01-01': 3, '2024-01-02': 10, '2024-01-03': 2 };
    assert.deepEqual(computeBusiestDay(days), { day: '2024-01-02', count: 10 });
});

test('resolveCharacterMeta: joins tags via tag_map', () => {
    const characters = [{ avatar: 'a.png', name: 'Alice' }, { avatar: 'b.png', name: 'Bob' }];
    const tags = [{ id: 't1', name: 'Romance' }, { id: 't2', name: 'Sci-Fi' }];
    const tagMap = { 'a.png': ['t1', 't2'], 'b.png': [] };
    const meta = resolveCharacterMeta(characters, tags, tagMap);
    assert.deepEqual(meta.get('a.png'), { name: 'Alice', tagNames: ['Romance', 'Sci-Fi'] });
    assert.deepEqual(meta.get('b.png'), { name: 'Bob', tagNames: [] });
});

function makeDigest(charDigests) {
    return { version: 1, characters: charDigests };
}

test('reduceDigest: sums totals across characters for a year, and folds into "all"', () => {
    const digest = makeDigest({
        'alice.png': {
            sig: {}, chatCount: 1,
            y: {
                '2024': {
                    um: 10, am: 12, gen: 15, uw: 100, aw: 200, sw: 3, gt: 60000,
                    mo: { 'claude-opus-5': 15 }, ap: { claude: 15 }, mm: {},
                    d: { '2024-01-01': 5, '2024-01-02': 5 }, h: new Array(24).fill(0),
                    first: 1, last: 2, chats: 2,
                    sup: { longestMessage: null, mostSwipes: null, longestGen: null, longestChat: null, bigWordDay: null },
                },
            },
        },
        'bob.png': {
            sig: {}, chatCount: 1,
            y: {
                '2024': {
                    um: 5, am: 5, gen: 5, uw: 50, aw: 50, sw: 0, gt: 0,
                    mo: { 'gpt-4': 5 }, ap: { openai: 5 }, mm: {},
                    d: { '2024-01-01': 2 }, h: new Array(24).fill(0),
                    first: 1, last: 2, chats: 1,
                    sup: { longestMessage: null, mostSwipes: null, longestGen: null, longestChat: null, bigWordDay: null },
                },
            },
        },
    });
    const meta = resolveCharacterMeta(
        [{ avatar: 'alice.png', name: 'Alice' }, { avatar: 'bob.png', name: 'Bob' }],
        [], {},
    );

    const summary = reduceDigest(digest, meta);
    assert.deepEqual(summary.years, ['2024']);

    const year2024 = summary.byYear['2024'];
    assert.equal(year2024.totals.userMessages, 15);
    assert.equal(year2024.totals.assistantMessages, 17);
    assert.equal(year2024.totals.messages, 32);
    assert.equal(year2024.totals.generations, 20);
    assert.equal(year2024.totals.characters, 2);
    assert.equal(year2024.totals.chats, 3);

    const all = summary.byYear.all;
    assert.equal(all.totals.messages, 32, '"all" folds the single year unchanged');
    assert.equal(all.characters.length, 2);
});

test('reduceDigest: new-vs-returning is computed per character\'s first active year', () => {
    const digest = makeDigest({
        'alice.png': {
            sig: {}, chatCount: 1,
            y: {
                '2023': {
                    um: 1, am: 1, gen: 1, uw: 1, aw: 1, sw: 0, gt: 0, mo: {}, ap: {}, mm: {},
                    d: {}, h: new Array(24).fill(0), first: null, last: null, chats: 1,
                    sup: { longestMessage: null, mostSwipes: null, longestGen: null, longestChat: null, bigWordDay: null },
                },
                '2024': {
                    um: 1, am: 1, gen: 1, uw: 1, aw: 1, sw: 0, gt: 0, mo: {}, ap: {}, mm: {},
                    d: {}, h: new Array(24).fill(0), first: null, last: null, chats: 1,
                    sup: { longestMessage: null, mostSwipes: null, longestGen: null, longestChat: null, bigWordDay: null },
                },
            },
        },
        'bob.png': {
            sig: {}, chatCount: 1,
            y: {
                '2024': {
                    um: 1, am: 1, gen: 1, uw: 1, aw: 1, sw: 0, gt: 0, mo: {}, ap: {}, mm: {},
                    d: {}, h: new Array(24).fill(0), first: null, last: null, chats: 1,
                    sup: { longestMessage: null, mostSwipes: null, longestGen: null, longestChat: null, bigWordDay: null },
                },
            },
        },
    });
    const meta = resolveCharacterMeta(
        [{ avatar: 'alice.png', name: 'Alice' }, { avatar: 'bob.png', name: 'Bob' }],
        [], {},
    );
    const summary = reduceDigest(digest, meta);

    assert.equal(summary.byYear['2023'].totals.newCharacters, 1);
    assert.equal(summary.byYear['2023'].totals.returningCharacters, 0);
    assert.equal(summary.byYear['2024'].totals.newCharacters, 1, 'bob is new in 2024');
    assert.equal(summary.byYear['2024'].totals.returningCharacters, 1, 'alice is returning in 2024');
});

test('reduceDigest: picks the best superlative candidate across characters', () => {
    const digest = makeDigest({
        'alice.png': {
            sig: {}, chatCount: 1,
            y: {
                '2024': {
                    um: 0, am: 0, gen: 0, uw: 0, aw: 0, sw: 0, gt: 0, mo: {}, ap: {}, mm: {},
                    d: {}, h: new Array(24).fill(0), first: null, last: null, chats: 0,
                    sup: {
                        longestMessage: { len: 500, date: 1, chat: 'a-chat' },
                        mostSwipes: null, longestGen: null, longestChat: null, bigWordDay: null,
                    },
                },
            },
        },
        'bob.png': {
            sig: {}, chatCount: 1,
            y: {
                '2024': {
                    um: 0, am: 0, gen: 0, uw: 0, aw: 0, sw: 0, gt: 0, mo: {}, ap: {}, mm: {},
                    d: {}, h: new Array(24).fill(0), first: null, last: null, chats: 0,
                    sup: {
                        longestMessage: { len: 2000, date: 1, chat: 'b-chat' },
                        mostSwipes: null, longestGen: null, longestChat: null, bigWordDay: null,
                    },
                },
            },
        },
    });
    const meta = resolveCharacterMeta(
        [{ avatar: 'alice.png', name: 'Alice' }, { avatar: 'bob.png', name: 'Bob' }],
        [], {},
    );
    const summary = reduceDigest(digest, meta);
    assert.equal(summary.byYear['2024'].superlatives.longestMessage.len, 2000);
    assert.equal(summary.byYear['2024'].superlatives.longestMessage.character, 'Bob');
});

test('reduceDigest: tags are counted per distinct character, not per message', () => {
    const digest = makeDigest({
        'alice.png': {
            sig: {}, chatCount: 1,
            y: {
                '2024': {
                    um: 100, am: 100, gen: 100, uw: 0, aw: 0, sw: 0, gt: 0, mo: {}, ap: {}, mm: {},
                    d: {}, h: new Array(24).fill(0), first: null, last: null, chats: 1,
                    sup: { longestMessage: null, mostSwipes: null, longestGen: null, longestChat: null, bigWordDay: null },
                },
            },
        },
        'bob.png': {
            sig: {}, chatCount: 1,
            y: {
                '2024': {
                    um: 1, am: 1, gen: 1, uw: 0, aw: 0, sw: 0, gt: 0, mo: {}, ap: {}, mm: {},
                    d: {}, h: new Array(24).fill(0), first: null, last: null, chats: 1,
                    sup: { longestMessage: null, mostSwipes: null, longestGen: null, longestChat: null, bigWordDay: null },
                },
            },
        },
    });
    const meta = resolveCharacterMeta(
        [{ avatar: 'alice.png', name: 'Alice' }, { avatar: 'bob.png', name: 'Bob' }],
        [{ id: 't1', name: 'Romance' }],
        { 'alice.png': ['t1'], 'bob.png': ['t1'] },
    );
    const summary = reduceDigest(digest, meta);
    const romanceTag = summary.byYear['2024'].tags.find((t) => t.key === 'Romance');
    assert.equal(romanceTag.count, 2, 'two distinct characters, regardless of message volume');
});

test('reduceDigest: unknown year is kept separate from "all" year listing', () => {
    const digest = makeDigest({
        'alice.png': {
            sig: {}, chatCount: 1,
            y: {
                unknown: {
                    um: 1, am: 1, gen: 1, uw: 1, aw: 1, sw: 0, gt: 0, mo: {}, ap: {}, mm: {},
                    d: {}, h: new Array(24).fill(0), first: null, last: null, chats: 1,
                    sup: { longestMessage: null, mostSwipes: null, longestGen: null, longestChat: null, bigWordDay: null },
                },
            },
        },
    });
    const meta = resolveCharacterMeta([{ avatar: 'alice.png', name: 'Alice' }], [], {});
    const summary = reduceDigest(digest, meta);
    assert.deepEqual(summary.years, []);
    assert.equal(summary.hasUnknown, true);
    assert.equal(summary.byYear.unknown.totals.messages, 2);
});

test('reduceDigest: "all" chat count does not double-count a chat spanning two years', () => {
    // One chat active in both 2023 (1 message) and 2024 (1 message) — per-year chats:1 each
    // is correct on its own, but naively summing those for "all" would report 2 chats when
    // there's really only one. scanner.js's chatCount (deduped across all of a character's
    // years) is what reduceDigest must use instead for the "all" total.
    const digest = makeDigest({
        'alice.png': {
            sig: {}, chatCount: 1, // one distinct chat, even though it touches two years
            y: {
                '2023': {
                    um: 0, am: 1, gen: 1, uw: 0, aw: 1, sw: 0, gt: 0, mo: {}, ap: {}, mm: {},
                    d: {}, h: new Array(24).fill(0), first: null, last: null, chats: 1,
                    sup: { longestMessage: null, mostSwipes: null, longestGen: null, longestChat: null, bigWordDay: null },
                },
                '2024': {
                    um: 0, am: 1, gen: 1, uw: 0, aw: 1, sw: 0, gt: 0, mo: {}, ap: {}, mm: {},
                    d: {}, h: new Array(24).fill(0), first: null, last: null, chats: 1,
                    sup: { longestMessage: null, mostSwipes: null, longestGen: null, longestChat: null, bigWordDay: null },
                },
            },
        },
    });
    const meta = resolveCharacterMeta([{ avatar: 'alice.png', name: 'Alice' }], [], {});
    const summary = reduceDigest(digest, meta);

    assert.equal(summary.byYear['2023'].totals.chats, 1);
    assert.equal(summary.byYear['2024'].totals.chats, 1);
    assert.equal(summary.byYear.all.totals.chats, 1, 'the same chat counted once, not twice, across the boundary');
});
