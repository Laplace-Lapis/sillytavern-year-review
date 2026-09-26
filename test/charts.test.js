import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildColorMap, donut, stackedBars, barList, legend } from '../app/charts.js';

test('buildColorMap: assigns colors in the given order, deduping repeats', () => {
    const map = buildColorMap(['claude', 'openrouter', 'claude']);
    assert.equal(map.size, 2);
    assert.notEqual(map.get('claude'), map.get('openrouter'));
});

test('buildColorMap: "unknown"/"Unknown" always get the fixed neutral color, not a rainbow slot', () => {
    const map = buildColorMap(['claude', 'Unknown', 'openrouter']);
    assert.equal(map.get('Unknown'), 'var(--yr-unknown-color)');
    // The two real labels still get distinct real colors, unaffected by Unknown's fixed slot.
    assert.notEqual(map.get('claude'), map.get('openrouter'));
    assert.notEqual(map.get('claude'), 'var(--yr-unknown-color)');
});

test('donut + stackedBars: sharing one colorMap assigns the same color to the same label', () => {
    // Regression for the "API mix by month" vs "Generations by API" color mismatch: donut
    // ranks APIs by total value, stackedBars' fallback ranks by first chronological
    // appearance across rows — those two orders can disagree, so a shared map is required for
    // them to agree on which color means which API.
    const apis = [{ label: 'claude', value: 100 }, { label: 'openrouter', value: 10 }];
    const colorMap = buildColorMap(apis.map((a) => a.label));

    const donutSvg = donut(apis, { colorMap });
    const donutClaudeColor = donutSvg.match(/stroke="([^"]+)"[^>]*>\s*<title>claude:/)?.[1];

    // A month where openrouter appears FIRST in the row (so a positional/first-seen scheme
    // would give it the "first" color) while claude is the actual dominant API overall.
    const rows = [{ label: 'Jan', segments: [{ label: 'openrouter', value: 1 }, { label: 'claude', value: 9 }] }];
    const stackedSvg = stackedBars(rows, { colorMap });
    const stackedClaudeColor = stackedSvg.match(/fill="([^"]+)"><title>claude:/)?.[1];

    assert.ok(donutClaudeColor, 'donut arc for claude found');
    assert.ok(stackedClaudeColor, 'stacked segment for claude found');
    assert.equal(donutClaudeColor, stackedClaudeColor, 'claude gets the same color in both charts');
});

test('stackedBars without a colorMap still colors consistently within itself (fallback)', () => {
    const rows = [
        { label: 'Jan', segments: [{ label: 'a', value: 1 }, { label: 'b', value: 1 }] },
        { label: 'Feb', segments: [{ label: 'b', value: 1 }, { label: 'a', value: 1 }] },
    ];
    const svg = stackedBars(rows);
    const aColors = [...svg.matchAll(/fill="([^"]+)"><title>a:/g)].map((m) => m[1]);
    assert.equal(aColors.length, 2);
    assert.equal(aColors[0], aColors[1], 'label "a" gets the same color in both rows');
});

test('barList: renders a badge marker only for items that have one', () => {
    const items = [{ label: 'Alice', value: 10, badge: 'new' }, { label: 'Bob', value: 5 }];
    const svg = barList(items);
    assert.match(svg, /yr-bar-badge-new/);
    const badgeCount = [...svg.matchAll(/yr-bar-badge-new/g)].length;
    assert.equal(badgeCount, 1, 'only Alice gets a badge');
});

test('legend: percentages are computed against the provided total, not just the items\' own sum', () => {
    const items = [{ label: 'a', value: 25 }];
    const html = legend(items, { total: 100 });
    assert.match(html, /25 \(25\.0%\)/);
});

test('legend: "Unknown" gets the neutral color even without an explicit colorMap', () => {
    const html = legend([{ label: 'Unknown', value: 5 }, { label: 'claude', value: 5 }]);
    assert.match(html, /background:var\(--yr-unknown-color\)/);
});
