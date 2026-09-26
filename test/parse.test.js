import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseTimestamp, countWords, fnv1a, dedupeKey, yearOf, dayKeyOf, monthKeyOf, hourOf,
    normalizeModel, normalizeApi, extractGenerationEvents, genTimeMs,
} from '../app/parse.js';

test('parseTimestamp: ISO 8601 UTC string', () => {
    const ms = parseTimestamp('2024-07-12T01:31:37.123Z');
    assert.equal(ms, new Date('2024-07-12T01:31:37.123Z').getTime());
});

test('parseTimestamp: Unix ms number', () => {
    assert.equal(parseTimestamp(1700000000000), 1700000000000);
    assert.equal(parseTimestamp('1700000000000'), 1700000000000);
});

test('parseTimestamp: Date object', () => {
    const date = new Date('2023-01-01T00:00:00Z');
    assert.equal(parseTimestamp(date), date.getTime());
});

test('parseTimestamp: humanized format with ms, parsed as local time', () => {
    const ms = parseTimestamp('2024-07-12@01h31m37s123ms');
    const expected = new Date(2024, 6, 12, 1, 31, 37, 123).getTime();
    assert.equal(ms, expected);
});

test('parseTimestamp: humanized format without ms', () => {
    const ms = parseTimestamp('2024-7-12@01h31m37s');
    const expected = new Date(2024, 6, 12, 1, 31, 37, 0).getTime();
    assert.equal(ms, expected);
});

test('parseTimestamp: humanized format with spaces', () => {
    const ms = parseTimestamp('2024-6-5 @14h 56m 50s 682ms');
    const expected = new Date(2024, 5, 5, 14, 56, 50, 682).getTime();
    assert.equal(ms, expected);
});

test('parseTimestamp: meridiem format, parsed as local time (consistent with humanized)', () => {
    const ms = parseTimestamp('June 19, 2023 2:20pm');
    const expected = new Date(2023, 5, 19, 14, 20, 0).getTime();
    assert.equal(ms, expected);
});

test('parseTimestamp: meridiem format, am and 12-hour edge cases', () => {
    assert.equal(parseTimestamp('January 1, 2024 12:00am'), new Date(2024, 0, 1, 0, 0, 0).getTime());
    assert.equal(parseTimestamp('January 1, 2024 12:00pm'), new Date(2024, 0, 1, 12, 0, 0).getTime());
});

test('parseTimestamp: unparseable input returns null', () => {
    assert.equal(parseTimestamp('not a date'), null);
    assert.equal(parseTimestamp(''), null);
    assert.equal(parseTimestamp(undefined), null);
    assert.equal(parseTimestamp(null), null);
});

test('parseTimestamp: negative number is invalid', () => {
    assert.equal(parseTimestamp(-5), null);
});

test('countWords: matches \\b\\w+\\b runs', () => {
    assert.equal(countWords('Hello, world! This is a test.'), 6);
    assert.equal(countWords(''), 0);
    assert.equal(countWords(null), 0);
    assert.equal(countWords('   '), 0);
});

test('fnv1a: deterministic and sensitive to content', () => {
    assert.equal(fnv1a('hello'), fnv1a('hello'));
    assert.notEqual(fnv1a('hello'), fnv1a('hellp'));
});

test('dedupeKey: identical send_date + mes collide, different content does not', () => {
    const a = dedupeKey('2024-01-01T00:00:00Z', 'Hello there');
    const b = dedupeKey('2024-01-01T00:00:00Z', 'Hello there');
    const c = dedupeKey('2024-01-01T00:00:00Z', 'Something else');
    assert.equal(a, b);
    assert.notEqual(a, c);
});

test('yearOf / dayKeyOf / monthKeyOf / hourOf', () => {
    const ms = new Date(2024, 6, 12, 15, 30, 0).getTime();
    assert.equal(yearOf(ms), 2024);
    assert.equal(dayKeyOf(ms), '2024-07-12');
    assert.equal(monthKeyOf(ms), '2024-07');
    assert.equal(hourOf(ms), 15);
});

test('normalizeModel: filters known junk values from online_status', () => {
    assert.equal(normalizeModel('no_connection'), null);
    assert.equal(normalizeModel('undefined'), null);
    assert.equal(normalizeModel(''), null);
    assert.equal(normalizeModel(undefined), null);
    assert.equal(normalizeModel('claude-opus-5'), 'claude-opus-5');
    assert.equal(normalizeModel('  gpt-4  '), 'gpt-4');
});

test('normalizeApi: filters empty values', () => {
    assert.equal(normalizeApi(''), null);
    assert.equal(normalizeApi(undefined), null);
    assert.equal(normalizeApi('claude'), 'claude');
});

test('genTimeMs: computes positive delta, rejects missing or negative', () => {
    assert.equal(genTimeMs('2024-01-01T00:00:00.000Z', '2024-01-01T00:00:05.000Z'), 5000);
    assert.equal(genTimeMs(undefined, '2024-01-01T00:00:05.000Z'), null);
    assert.equal(genTimeMs('2024-01-01T00:00:05.000Z', '2024-01-01T00:00:00.000Z'), null);
});

test('extractGenerationEvents: single message, no swipes', () => {
    const message = { extra: { api: 'claude', model: 'claude-opus-5' }, gen_started: '2024-01-01T00:00:00.000Z', gen_finished: '2024-01-01T00:00:03.000Z' };
    const events = extractGenerationEvents(message);
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], { api: 'claude', model: 'claude-opus-5', genTimeMs: 3000 });
});

test('extractGenerationEvents: uses swipe_info per-swipe attribution when present', () => {
    const message = {
        extra: { api: 'claude', model: 'claude-opus-5' },
        swipes: ['a', 'b', 'c'],
        swipe_info: [
            { extra: { api: 'claude', model: 'claude-opus-5' }, gen_started: 0, gen_finished: 1000 },
            { extra: { api: 'openai', model: 'gpt-4' }, gen_started: 0, gen_finished: 2000 },
            { extra: {}, gen_started: 0, gen_finished: 500 },
        ],
    };
    const events = extractGenerationEvents(message);
    assert.equal(events.length, 3);
    assert.equal(events[0].api, 'claude');
    assert.equal(events[1].model, 'gpt-4');
    assert.equal(events[2].api, null, 'backfilled swipe_info entries with empty extra land in unknown');
});

test('extractGenerationEvents: legacy swipes with no swipe_info proxies the kept message', () => {
    const message = { extra: { api: 'novel', model: 'clio' }, swipes: ['a', 'b', 'c'] };
    const events = extractGenerationEvents(message);
    assert.equal(events.length, 3);
    assert.ok(events.every((e) => e.api === 'novel' && e.model === 'clio'));
    assert.equal(events[0].genTimeMs, null, 'no gen_started/finished on this message');
    assert.equal(events[1].genTimeMs, null, 'timing is never fabricated for swipes beyond the kept one');
});

test('extractGenerationEvents: message with no swipes at all', () => {
    const message = { extra: { api: 'claude', model: 'claude-opus-5' } };
    const events = extractGenerationEvents(message);
    assert.equal(events.length, 1);
});
