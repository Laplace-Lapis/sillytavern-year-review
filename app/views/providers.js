import { barList, donut, stackedBars, buildColorMap, legend, capSegmentsToLabels } from '../charts.js';
import { formatNumber, formatMonth } from '../format.js';

const UNKNOWN_LABEL = 'Unknown';
// How many individual models the monthly breakdown keeps as their own segment before folding
// the rest into "Other" — see charts.js's capSegmentsToLabels doc comment for why a cap is
// needed here but not for APIs (there are usually only a handful of distinct APIs, but
// potentially dozens of distinct models).
const MODEL_MIX_TOP_N = 7;

function withUnknownLabel(entries) {
    return entries.map((entry) => ({ label: entry.key === 'unknown' ? UNKNOWN_LABEL : entry.key, value: entry.count }));
}

function monthlyBreakdownRows(months, field) {
    return months.map((m) => ({
        label: formatMonth(m.month),
        segments: Object.entries(m[field]).map(([key, count]) => ({ label: key === 'unknown' ? UNKNOWN_LABEL : key, value: count })),
    })).filter((row) => row.segments.length > 0);
}

/**
 * Renders one monthly-breakdown "slide" (arrows + label + chart) into `container`. Re-render
 * is done by replacing this container's contents, not the whole section, so the arrows
 * themselves don't need to be re-wired on every toggle.
 * @param {HTMLElement} container
 * @param {Array<{key: string, label: string, rows: object[], colorMap: Map<string, string>}>} slides
 * @param {number} index
 */
function renderMonthlySlide(container, slides, index) {
    const slide = slides[index];
    const showArrows = slides.length > 1;
    container.innerHTML = `
        <div class="yr-chart-toggle">
            ${showArrows ? '<button type="button" class="yr-chart-toggle-arrow" data-dir="-1" aria-label="Previous breakdown">‹</button>' : ''}
            <span class="yr-chart-toggle-label">${slide.label}</span>
            ${showArrows ? '<button type="button" class="yr-chart-toggle-arrow" data-dir="1" aria-label="Next breakdown">›</button>' : ''}
        </div>
        ${stackedBars(slide.rows, { colorMap: slide.colorMap })}
    `;
    if (showArrows) {
        container.querySelectorAll('.yr-chart-toggle-arrow').forEach((button) => {
            button.addEventListener('click', () => {
                const nextIndex = (index + Number(button.dataset.dir) + slides.length) % slides.length;
                renderMonthlySlide(container, slides, nextIndex);
            });
        });
    }
}

/**
 * Renders the providers/models section: API share donut, top-models bar list, and a
 * month-by-month breakdown that toggles between API mix and model mix (arrows).
 *
 * Charts breaking down the SAME dimension share one color map — the API donut and the
 * API-mix slide share `apisColorMap`; the "Top models" bar list and the model-mix slide share
 * `modelsColorMap` — built once each from that dimension's own rank order. Without this, two
 * charts independently coloring-by-array-position can assign the same color to different
 * real-world labels whenever their local sort orders differ, which looks like a bug even when
 * both charts' numbers are correct (see CLAUDE.md).
 * @param {HTMLElement} section
 * @param {object} yearData One entry of summary.byYear.
 */
export function renderProviders(section, yearData) {
    const apis = withUnknownLabel(yearData.apis);
    const allModels = withUnknownLabel(yearData.models);
    const topModelsForList = allModels.slice(0, 10);
    const totalGenerations = yearData.totals.generations;
    const swipeRatio = totalGenerations > 0 ? (yearData.totals.swipes / totalGenerations) : 0;
    const apisColorMap = buildColorMap(apis.map((a) => a.label));
    const modelsColorMap = buildColorMap(allModels.map((m) => m.label));

    const apiMonthRows = monthlyBreakdownRows(yearData.months, 'apis');
    const topModelLabels = new Set(allModels.slice(0, MODEL_MIX_TOP_N).map((m) => m.label));
    const modelMonthRows = capSegmentsToLabels(monthlyBreakdownRows(yearData.months, 'models'), topModelLabels);

    const slides = [
        { key: 'api', label: 'API mix by month', rows: apiMonthRows, colorMap: apisColorMap },
        { key: 'model', label: 'Model mix by month', rows: modelMonthRows, colorMap: modelsColorMap },
    ].filter((slide) => slide.rows.length > 0);

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
                ${topModelsForList.length > 0 ? barList(topModelsForList, { colorMap: modelsColorMap }) : '<p class="yr-card-label">No attributed generations.</p>'}
            </div>
        </div>
        ${slides.length > 0 ? `
            <div class="yr-panel">
                <div id="yrProviderMonthlySlide"></div>
            </div>
        ` : ''}
        <p class="yr-card-label">"Unknown" covers messages where the provider/model wasn't recorded — common for chats from before this data was tracked, or for local/offline backends that don't report a model id. "Other" (in the monthly model mix) groups every model outside this year's top ${MODEL_MIX_TOP_N}. The API donut and the "Top models" list are different breakdowns (one API often serves several models — OpenRouter users in particular will see one dominant API but a varied model mix), so their proportions won't match — see the legend above the donut for the API split.</p>
    `;

    if (slides.length > 0) {
        renderMonthlySlide(section.querySelector('#yrProviderMonthlySlide'), slides, 0);
    }
}
