import { barList, donut, stackedBars, buildColorMap, legend } from '../charts.js';
import { formatNumber, formatMonth } from '../format.js';

const UNKNOWN_LABEL = 'Unknown';

function withUnknownLabel(entries) {
    return entries.map((entry) => ({ label: entry.key === 'unknown' ? UNKNOWN_LABEL : entry.key, value: entry.count }));
}

/**
 * Renders the providers/models section: API share donut, top-models bar list, and a
 * month-by-month stacked bar of API usage.
 *
 * The donut and the monthly stacked bar both break down the SAME dimension (APIs), so they
 * share one color map (`apisColorMap`, built once from the donut's own rank order) — without
 * that, each chart independently coloring-by-array-position can assign the same color to two
 * different APIs (donut ranks by total; the stacked bar's rows are chronological), which looks
 * like a rendering bug even when both charts' numbers are correct. The top-models bar list is
 * a different dimension with nothing else on the page to stay consistent with, so it still
 * colors by its own rank.
 * @param {HTMLElement} section
 * @param {object} yearData One entry of summary.byYear.
 */
export function renderProviders(section, yearData) {
    const apis = withUnknownLabel(yearData.apis);
    const models = withUnknownLabel(yearData.models).slice(0, 10);
    const totalGenerations = yearData.totals.generations;
    const swipeRatio = totalGenerations > 0 ? (yearData.totals.swipes / totalGenerations) : 0;
    const apisColorMap = buildColorMap(apis.map((a) => a.label));

    const monthRows = yearData.months.map((m) => ({
        label: formatMonth(m.month),
        segments: Object.entries(m.apis).map(([api, count]) => ({ label: api === 'unknown' ? UNKNOWN_LABEL : api, value: count })),
    })).filter((row) => row.segments.length > 0);

    section.innerHTML = `
        <h2 class="yr-section-title">Providers &amp; models</h2>
        <div class="yr-card-grid">
            <div class="yr-card">
                <div class="yr-card-value">${formatNumber(yearData.totals.assistantMessages)}</div>
                <div class="yr-card-label">Messages kept</div>
            </div>
            <div class="yr-card">
                <div class="yr-card-value">${formatNumber(totalGenerations)}</div>
                <div class="yr-card-label">Total generations (incl. swipes)</div>
            </div>
            <div class="yr-card">
                <div class="yr-card-value">${(swipeRatio * 100).toFixed(0)}%</div>
                <div class="yr-card-label">Of generations were swipes</div>
            </div>
        </div>
        <div class="yr-two-col">
            <div class="yr-panel">
                <h3 class="yr-panel-title">Generations by API</h3>
                ${apis.length > 0 ? `
                    <div class="yr-donut-block">
                        ${donut(apis, { centerLabel: formatNumber(totalGenerations), colorMap: apisColorMap })}
                        ${legend(apis, { colorMap: apisColorMap, total: totalGenerations })}
                    </div>
                ` : '<p class="yr-card-label">No attributed generations.</p>'}
            </div>
            <div class="yr-panel">
                <h3 class="yr-panel-title">Top models</h3>
                ${models.length > 0 ? barList(models) : '<p class="yr-card-label">No attributed generations.</p>'}
            </div>
        </div>
        ${monthRows.length > 0 ? `
            <div class="yr-panel">
                <h3 class="yr-panel-title">API mix by month</h3>
                ${stackedBars(monthRows, { colorMap: apisColorMap })}
            </div>
        ` : ''}
        <p class="yr-card-label">"Unknown" covers messages where the provider/model wasn't recorded — common for chats from before this data was tracked, or for local/offline backends that don't report a model id. The API donut and the "Top models" list are different breakdowns (one API often serves several models), so their proportions won't match — see the legend above for the API split.</p>
    `;
}
