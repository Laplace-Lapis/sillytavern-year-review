// Hand-rolled inline SVG chart primitives. No chart library is vendored (see CLAUDE.md) —
// these five shapes cover everything the views need: a horizontal bar list, a stacked bar
// (for provider share over time), a donut, a calendar heatmap, and a simple line/area series.
//
// Every function returns an SVG string, ready to be assigned to an element's innerHTML by
// the caller (or wrapped in a container div for layout). Colors are read from CSS custom
// properties set in app/review.css (--yr-series-1.. etc.) via `var(...)`, so a single palette
// change there re-themes every chart.

const SERIES_COLORS = [
    'var(--yr-series-1)', 'var(--yr-series-2)', 'var(--yr-series-3)', 'var(--yr-series-4)',
    'var(--yr-series-5)', 'var(--yr-series-6)', 'var(--yr-series-7)', 'var(--yr-series-8)',
];

const UNKNOWN_COLOR = 'var(--yr-unknown-color)';
const UNKNOWN_LABELS = new Set(['unknown', 'Unknown']);

function colorFor(index) {
    return SERIES_COLORS[index % SERIES_COLORS.length];
}

/**
 * Assigns one stable color per label, in the given order — meant to be built ONCE from
 * whichever list is the "canonical" ranking for a dimension (e.g. the APIs donut's sortedDesc
 * order) and then reused by every other chart that breaks the same dimension down further
 * (e.g. a month-by-month stacked bar of the same APIs). Without this, two charts that
 * independently color-by-array-position can assign the same color to different real-world
 * labels whenever their local sort orders differ (e.g. one ranked by total, the other by
 * first chronological appearance) — which looks like a bug even when both charts' numbers are
 * individually correct. `unknown`/`Unknown` always gets a fixed neutral color instead of a
 * rainbow slot, since it isn't a real category and stealing a bright color for it is
 * confusing.
 * @param {string[]} labels In priority order; first label gets the first real color.
 * @returns {Map<string, string>}
 */
export function buildColorMap(labels) {
    const map = new Map();
    let nextIndex = 0;
    for (const label of labels) {
        if (map.has(label)) {
            continue;
        }
        map.set(label, UNKNOWN_LABELS.has(label) ? UNKNOWN_COLOR : colorFor(nextIndex++));
    }
    return map;
}

function resolveColor(label, index, colorMap) {
    if (colorMap?.has(label)) {
        return colorMap.get(label);
    }
    if (UNKNOWN_LABELS.has(label)) {
        return UNKNOWN_COLOR;
    }
    return colorFor(index);
}

/**
 * Renders an HTML (not SVG) legend list for a donut or stacked-bar chart: one row per item
 * with a color swatch, label, value, and share of the total. Meant to sit next to or below
 * the chart it describes, since hovering an SVG arc for its tooltip isn't discoverable and a
 * label-less donut is unreadable on its own (see CLAUDE.md).
 * @param {Array<{label: string, value: number}>} items
 * @param {object} [options]
 * @param {Map<string, string>} [options.colorMap] Shared color map (see buildColorMap).
 * @param {(item: object) => string} [options.formatValue]
 * @param {number} [options.total] Denominator for the percentage; defaults to the items' own sum.
 * @returns {string} HTML markup (a `<ul>`), not SVG.
 */
export function legend(items, options = {}) {
    const { colorMap, formatValue = (item) => String(item.value), total } = options;
    const sum = total ?? Math.max(1, items.reduce((s, i) => s + i.value, 0));
    return `<ul class="yr-legend">${items.map((item, index) => {
        const color = resolveColor(item.label, index, colorMap);
        const pct = ((item.value / sum) * 100).toFixed(1);
        return `<li class="yr-legend-item">
            <span class="yr-legend-swatch" style="background:${color}"></span>
            <span class="yr-legend-label">${escapeAttr(item.label)}</span>
            <span class="yr-legend-value">${escapeAttr(formatValue(item))} (${pct}%)</span>
        </li>`;
    }).join('')}</ul>`;
}

/**
 * Escapes a value for safe interpolation into HTML/SVG markup (text content or an attribute
 * value in double quotes). Exported so views that build markup directly (not through one of
 * the chart functions below) can escape character names, avatar filenames, etc. themselves —
 * see CLAUDE.md's "Chat message text and character names reach `innerHTML`..." gotcha.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeAttr(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
}

/**
 * Horizontal ranked bar list — used for top characters, top models, top APIs, top tags.
 * @param {Array<{label: string, value: number, badge?: string}>} items Pre-sorted, longest
 *   first. An item's optional `badge` (e.g. 'new') renders as a small marker before its label —
 *   used for "this character is new this year" in the top-characters list.
 * @param {object} [options]
 * @param {number} [options.max] Value the longest bar should represent (defaults to items[0].value).
 * @param {number} [options.width]
 * @param {number} [options.barHeight]
 * @param {number} [options.gap]
 * @param {(item: object) => string} [options.formatValue]
 * @param {Map<string, string>} [options.colorMap] Shared color map (see buildColorMap) — omit
 *   to color by rank position, which is fine when nothing else on the page shares this list's
 *   labels (e.g. top characters; contrast with providers.js's APIs, which do share).
 * @returns {string} SVG markup.
 */
export function barList(items, options = {}) {
    const { width = 480, barHeight = 22, gap = 8, formatValue = (item) => String(item.value), colorMap } = options;
    const max = options.max ?? Math.max(1, ...items.map((item) => item.value));
    const rowHeight = barHeight + gap;
    const height = Math.max(1, items.length) * rowHeight;
    const labelWidth = 140;
    const trackWidth = width - labelWidth - 48;

    const rows = items.map((item, index) => {
        const barWidth = Math.max(2, (item.value / max) * trackWidth);
        const y = index * rowHeight;
        const badge = item.badge
            ? `<circle cx="${labelWidth - 4}" cy="${y + barHeight / 2}" r="3" class="yr-bar-badge yr-bar-badge-${escapeAttr(item.badge)}"><title>${escapeAttr(item.badge)}</title></circle>`
            : '';
        return `
            <text x="${labelWidth - (item.badge ? 14 : 8)}" y="${y + barHeight / 2}" text-anchor="end" dominant-baseline="middle" class="yr-bar-label">${escapeAttr(item.label)}</text>
            ${badge}
            <rect x="${labelWidth}" y="${y}" width="${trackWidth}" height="${barHeight}" rx="4" class="yr-bar-track"></rect>
            <rect x="${labelWidth}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="${resolveColor(item.label, index, colorMap)}"></rect>
            <text x="${labelWidth + barWidth + 8}" y="${y + barHeight / 2}" dominant-baseline="middle" class="yr-bar-value">${escapeAttr(formatValue(item))}</text>
        `;
    }).join('');

    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" class="yr-chart yr-bar-list">${rows}</svg>`;
}

/**
 * A single stacked horizontal bar (e.g. provider share for one time bucket) or a column of
 * them (e.g. one per month), each segment sized by its share of that row's total.
 * @param {Array<{label: string, segments: Array<{label: string, value: number}>}>} rows
 * @param {object} [options]
 * @param {Map<string, string>} [options.colorMap] Shared color map (see buildColorMap) — pass
 *   the SAME map used for any other chart of the same dimension (e.g. the APIs donut), or
 *   segments will get colored by first-chronological-appearance-across-rows instead of by
 *   rank, which can assign a different color to the same label than a sibling chart uses.
 * @returns {string} SVG markup.
 */
export function stackedBars(rows, options = {}) {
    const { width = 480, barHeight = 18, gap = 6, labelWidth = 60, colorMap } = options;
    const rowHeight = barHeight + gap;
    const height = Math.max(1, rows.length) * rowHeight;
    const trackWidth = width - labelWidth - 8;

    // Fallback when no shared colorMap is supplied: still consistent across THIS chart's own
    // rows (first-seen order), just not guaranteed to match any other chart's assignment.
    const fallbackOrder = [];
    if (!colorMap) {
        for (const row of rows) {
            for (const segment of row.segments) {
                if (!fallbackOrder.includes(segment.label)) {
                    fallbackOrder.push(segment.label);
                }
            }
        }
    }

    const body = rows.map((row, rowIndex) => {
        const total = Math.max(1, row.segments.reduce((sum, s) => sum + s.value, 0));
        const y = rowIndex * rowHeight;
        let x = labelWidth;
        const segments = row.segments.map((segment) => {
            const segWidth = (segment.value / total) * trackWidth;
            const color = resolveColor(segment.label, fallbackOrder.indexOf(segment.label), colorMap);
            const rect = `<rect x="${x}" y="${y}" width="${Math.max(0, segWidth)}" height="${barHeight}" fill="${color}"><title>${escapeAttr(segment.label)}: ${escapeAttr(segment.value)}</title></rect>`;
            x += segWidth;
            return rect;
        }).join('');
        return `<text x="${labelWidth - 8}" y="${y + barHeight / 2}" text-anchor="end" dominant-baseline="middle" class="yr-bar-label">${escapeAttr(row.label)}</text>${segments}`;
    }).join('');

    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" class="yr-chart yr-stacked-bars">${body}</svg>`;
}

/**
 * A donut chart with a center label (e.g. total count). Renders at a fixed intrinsic size and
 * relies on its caller wrapping it in a centering container (see `.yr-donut-block` in
 * review.css) — an SVG with `width`/`height` set is centered *within itself*, but a block
 * element with no `margin: auto` still hugs the left edge of a wider parent panel.
 * @param {Array<{label: string, value: number}>} items
 * @param {object} [options]
 * @param {Map<string, string>} [options.colorMap] Shared color map (see buildColorMap) — pass
 *   this when another chart on the page breaks down the same dimension (e.g. an API-by-month
 *   stacked bar next to an API donut) so the two agree on which color means what.
 * @returns {string} SVG markup.
 */
export function donut(items, options = {}) {
    const { size = 200, thickness = 28, centerLabel = '', colorMap } = options;
    const total = Math.max(1, items.reduce((sum, item) => sum + item.value, 0));
    const radius = size / 2 - thickness / 2;
    const cx = size / 2;
    const cy = size / 2;
    const circumference = 2 * Math.PI * radius;

    let offset = 0;
    const arcs = items.map((item, index) => {
        const fraction = item.value / total;
        const dash = fraction * circumference;
        const arc = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${resolveColor(item.label, index, colorMap)}" stroke-width="${thickness}"
            stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})">
            <title>${escapeAttr(item.label)}: ${escapeAttr(item.value)}</title>
        </circle>`;
        offset += dash;
        return arc;
    }).join('');

    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="yr-chart yr-donut">
        ${arcs}
        <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" class="yr-donut-center">${escapeAttr(centerLabel)}</text>
    </svg>`;
}

/**
 * A GitHub-style calendar heatmap for one year, one column per week, one cell per day.
 * @param {Record<string, number>} dayCounts Map of 'YYYY-MM-DD' -> count.
 * @param {number} year
 * @param {object} [options]
 * @returns {string} SVG markup.
 */
export function calendarHeatmap(dayCounts, year, options = {}) {
    const { cellSize = 11, cellGap = 2 } = options;
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    const startWeekday = start.getDay();
    const step = cellSize + cellGap;
    const max = Math.max(1, ...Object.values(dayCounts));

    const cells = [];
    let dayIndex = 0;
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1), dayIndex++) {
        const week = Math.floor((dayIndex + startWeekday) / 7);
        const weekday = (dayIndex + startWeekday) % 7;
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const key = `${y}-${m}-${d}`;
        const count = dayCounts[key] ?? 0;
        const intensity = count === 0 ? 0 : Math.min(1, count / max);
        cells.push(`<rect x="${week * step}" y="${weekday * step}" width="${cellSize}" height="${cellSize}" rx="2"
            class="yr-heatmap-cell" style="--yr-intensity:${intensity.toFixed(2)}">
            <title>${key}: ${count}</title>
        </rect>`);
    }

    const weeks = Math.ceil((dayIndex + startWeekday) / 7);
    const width = weeks * step;
    const height = 7 * step;

    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" class="yr-chart yr-heatmap">${cells.join('')}</svg>`;
}

/**
 * A simple line/area chart over an ordered series (e.g. messages per month).
 *
 * Unlike the other chart types, this one does NOT stretch to `width: 100%` of its container:
 * for a long series (e.g. "All time" across several years) that would squeeze every point
 * into the same fixed pixel width as a 12-point single year, cramming axis labels into
 * illegibility. Instead the SVG's native width grows with the point count (roughly constant
 * pixels-per-point), and the caller is expected to wrap the output in a horizontally
 * scrollable container (`.yr-scroll-x` in review.css) so a long series scrolls instead of
 * squishing. For a typical ≤12-point single year this still comes out close to the old fixed
 * 480px default, so nothing visually changes for the common case.
 * @param {Array<{label: string, value: number}>} points
 * @param {object} [options]
 * @param {number} [options.width] Explicit pixel width; defaults to ~40px per point (min 360).
 * @returns {string} SVG markup.
 */
export function lineSeries(points, options = {}) {
    const { height = 160, padding = 24, area = true } = options;
    const width = options.width ?? Math.max(360, points.length * 40);
    if (points.length === 0) {
        return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="yr-chart yr-line"></svg>`;
    }
    const max = Math.max(1, ...points.map((p) => p.value));
    const innerWidth = width - padding * 2;
    const innerHeight = height - padding * 2;
    const stepX = points.length > 1 ? innerWidth / (points.length - 1) : 0;

    const coords = points.map((point, index) => {
        const x = padding + index * stepX;
        const y = padding + innerHeight - (point.value / max) * innerHeight;
        return [x, y];
    });

    const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const areaPath = area
        ? `${linePath} L${coords[coords.length - 1][0].toFixed(1)},${padding + innerHeight} L${coords[0][0].toFixed(1)},${padding + innerHeight} Z`
        : '';

    const dots = coords.map(([x, y], index) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" class="yr-line-dot"><title>${escapeAttr(points[index].label)}: ${escapeAttr(points[index].value)}</title></circle>`).join('');
    const labels = points.map((point, index) => `<text x="${coords[index][0].toFixed(1)}" y="${height - 4}" text-anchor="middle" class="yr-line-axis-label">${escapeAttr(point.label)}</text>`).join('');

    return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="yr-chart yr-line">
        ${area ? `<path d="${areaPath}" class="yr-line-area"></path>` : ''}
        <path d="${linePath}" class="yr-line-path" fill="none"></path>
        ${dots}
        ${labels}
    </svg>`;
}

/**
 * A 24-bar histogram for hour-of-day activity, with axis labels every `labelEvery` hours.
 * @param {number[]} hours Array of 24 counts.
 * @param {object} [options]
 * @param {number} [options.labelEvery] Show an hour label every N bars (default every 3 hours).
 * @returns {string} SVG markup.
 */
export function hourHistogram(hours, options = {}) {
    const { width = 480, height = 116, barGap = 2, labelEvery = 3 } = options;
    const labelAreaHeight = 20;
    const barAreaHeight = height - labelAreaHeight;
    const max = Math.max(1, ...hours);
    const barWidth = width / 24 - barGap;
    const bars = hours.map((count, hour) => {
        const barHeight = (count / max) * (barAreaHeight - 4);
        const x = hour * (barWidth + barGap);
        const y = barAreaHeight - barHeight;
        return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" class="yr-hour-bar"><title>${hour}:00 — ${count}</title></rect>`;
    }).join('');
    const labels = hours.map((count, hour) => {
        if (hour % labelEvery !== 0) {
            return '';
        }
        const x = hour * (barWidth + barGap) + barWidth / 2;
        return `<text x="${x.toFixed(1)}" y="${height - 4}" text-anchor="middle" class="yr-hour-axis-label">${hour}h</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" class="yr-chart yr-hour-histogram">${bars}${labels}</svg>`;
}
