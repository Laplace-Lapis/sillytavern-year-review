import { barList } from '../charts.js';

/**
 * Renders the top-tags bar list (distinct characters engaged with per tag).
 * @param {HTMLElement} section
 * @param {object} yearData One entry of summary.byYear.
 */
export function renderTags(section, yearData) {
    const top = yearData.tags.slice(0, 10).map((t) => ({ label: t.key, value: t.count }));

    section.innerHTML = `
        <h2 class="yr-section-title">Tags</h2>
        <div class="yr-panel">
            <h3 class="yr-panel-title">Characters engaged with, by tag</h3>
            ${top.length > 0 ? barList(top, { formatValue: (item) => `${item.value} char${item.value === 1 ? '' : 's'}` }) : '<p class="yr-card-label">No tagged characters active in this period.</p>'}
        </div>
    `;
}
