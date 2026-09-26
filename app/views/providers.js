import { barList, donut, stackedBars } from '../charts.js';
import { formatNumber, formatMonth } from '../format.js';

const UNKNOWN_LABEL = 'Unknown';

function withUnknownLabel(entries) {
    return entries.map((entry) => ({ label: entry.key === 'unknown' ? UNKNOWN_LABEL : entry.key, value: entry.count }));
}

/**
 * Renders the providers/models section: API share donut, top-models bar list, and a
 * month-by-month stacked bar of API usage.
 * @param {HTMLElement} section
 * @param {object} yearData One entry of summary.byYear.
 */
export function renderProviders(section, yearData) {
    const apis = withUnknownLabel(yearData.apis);
    const models = withUnknownLabel(yearData.models).slice(0, 10);
    const totalGenerations = yearData.totals.generations;
    const swipeRatio = totalGenerations > 0 ? (yearData.totals.swipes / totalGenerations) : 0;

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
                ${apis.length > 0 ? donut(apis, { centerLabel: formatNumber(totalGenerations) }) : '<p class="yr-card-label">No attributed generations.</p>'}
            </div>
            <div class="yr-panel">
                <h3 class="yr-panel-title">Top models</h3>
                ${models.length > 0 ? barList(models) : '<p class="yr-card-label">No attributed generations.</p>'}
            </div>
        </div>
        ${monthRows.length > 0 ? `
            <div class="yr-panel">
                <h3 class="yr-panel-title">API mix by month</h3>
                ${stackedBars(monthRows)}
            </div>
        ` : ''}
        <p class="yr-card-label">"Unknown" covers messages where the provider/model wasn't recorded — common for chats from before this data was tracked, or for local/offline backends that don't report a model id.</p>
    `;
}
