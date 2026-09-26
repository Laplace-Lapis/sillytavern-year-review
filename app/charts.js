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

function colorFor(index) {
    return SERIES_COLORS[index % SERIES_COLORS.length];
}

function escapeAttr(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
}

/**
 * Horizontal ranked bar list — used for top characters, top models, top APIs, top tags.
 * @param {Array<{label: string, value: number}>} items Pre-sorted, longest first.
 * @param {object} [options]
 * @param {number} [options.max] Value the longest bar should represent (defaults to items[0].value).
 * @param {number} [options.width]
 * @param {number} [options.barHeight]
 * @param {number} [options.gap]
 * @param {(item: object) => string} [options.formatValue]
 * @returns {string} SVG markup.
 */
export function barList(items, options = {}) {
    const { width = 480, barHeight = 22, gap = 8, formatValue = (item) => String(item.value) } = options;
    const max = options.max ?? Math.max(1, ...items.map((item) => item.value));
    const rowHeight = barHeight + gap;
    const height = Math.max(1, items.length) * rowHeight;
    const labelWidth = 140;
    const trackWidth = width - labelWidth - 48;

    const rows = items.map((item, index) => {
        const barWidth = Math.max(2, (item.value / max) * trackWidth);
        const y = index * rowHeight;
        return `
            <text x="${labelWidth - 8}" y="${y + barHeight / 2}" text-anchor="end" dominant-baseline="middle" class="yr-bar-label">${escapeAttr(item.label)}</text>
            <rect x="${labelWidth}" y="${y}" width="${trackWidth}" height="${barHeight}" rx="4" class="yr-bar-track"></rect>
            <rect x="${labelWidth}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="${colorFor(index)}"></rect>
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
 * @returns {string} SVG markup.
 */
export function stackedBars(rows, options = {}) {
    const { width = 480, barHeight = 18, gap = 6, labelWidth = 60 } = options;
    const rowHeight = barHeight + gap;
    const height = Math.max(1, rows.length) * rowHeight;
    const trackWidth = width - labelWidth - 8;

    // Consistent color per segment label across all rows (e.g. same model = same color in
    // every month), not per position.
    const labelOrder = [];
    for (const row of rows) {
        for (const segment of row.segments) {
            if (!labelOrder.includes(segment.label)) {
                labelOrder.push(segment.label);
            }
        }
    }

    const body = rows.map((row, rowIndex) => {
        const total = Math.max(1, row.segments.reduce((sum, s) => sum + s.value, 0));
        const y = rowIndex * rowHeight;
        let x = labelWidth;
        const segments = row.segments.map((segment) => {
            const segWidth = (segment.value / total) * trackWidth;
            const rect = `<rect x="${x}" y="${y}" width="${Math.max(0, segWidth)}" height="${barHeight}" fill="${colorFor(labelOrder.indexOf(segment.label))}"><title>${escapeAttr(segment.label)}: ${escapeAttr(segment.value)}</title></rect>`;
            x += segWidth;
            return rect;
        }).join('');
        return `<text x="${labelWidth - 8}" y="${y + barHeight / 2}" text-anchor="end" dominant-baseline="middle" class="yr-bar-label">${escapeAttr(row.label)}</text>${segments}`;
    }).join('');

    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" class="yr-chart yr-stacked-bars">${body}</svg>`;
}

/**
 * A donut chart with a center label (e.g. total count).
 * @param {Array<{label: string, value: number}>} items
 * @param {object} [options]
 * @returns {string} SVG markup.
 */
export function donut(items, options = {}) {
    const { size = 200, thickness = 28, centerLabel = '' } = options;
    const total = Math.max(1, items.reduce((sum, item) => sum + item.value, 0));
    const radius = size / 2 - thickness / 2;
    const cx = size / 2;
    const cy = size / 2;
    const circumference = 2 * Math.PI * radius;

    let offset = 0;
    const arcs = items.map((item, index) => {
        const fraction = item.value / total;
        const dash = fraction * circumference;
        const arc = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${colorFor(index)}" stroke-width="${thickness}"
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
 * @param {Array<{label: string, value: number}>} points
 * @param {object} [options]
 * @returns {string} SVG markup.
 */
export function lineSeries(points, options = {}) {
    const { width = 480, height = 160, padding = 24, area = true } = options;
    if (points.length === 0) {
        return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" class="yr-chart yr-line"></svg>`;
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

    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" class="yr-chart yr-line">
        ${area ? `<path d="${areaPath}" class="yr-line-area"></path>` : ''}
        <path d="${linePath}" class="yr-line-path" fill="none"></path>
        ${dots}
        ${labels}
    </svg>`;
}

/**
 * A 24-bar histogram for hour-of-day activity.
 * @param {number[]} hours Array of 24 counts.
 * @param {object} [options]
 * @returns {string} SVG markup.
 */
export function hourHistogram(hours, options = {}) {
    const { width = 480, height = 100, barGap = 2 } = options;
    const max = Math.max(1, ...hours);
    const barWidth = width / 24 - barGap;
    const bars = hours.map((count, hour) => {
        const barHeight = (count / max) * (height - 16);
        const x = hour * (barWidth + barGap);
        const y = height - barHeight;
        return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" class="yr-hour-bar"><title>${hour}:00 — ${count}</title></rect>`;
    }).join('');
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" class="yr-chart yr-hour-histogram">${bars}</svg>`;
}
