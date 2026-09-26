import { barList, donut } from '../charts.js';
import { formatNumber } from '../format.js';

/**
 * Renders the top-characters bar list and new-vs-returning donut.
 * @param {HTMLElement} section
 * @param {object} yearData One entry of summary.byYear.
 */
export function renderCharacters(section, yearData) {
    const top = yearData.characters.slice(0, 10).map((c) => ({ label: c.name, value: c.messages }));
    const t = yearData.totals;
    const hasSplit = t.newCharacters + t.returningCharacters > 0;

    section.innerHTML = `
        <h2 class="yr-section-title">Characters</h2>
        <div class="yr-two-col">
            <div class="yr-panel">
                <h3 class="yr-panel-title">Top characters by messages</h3>
                ${top.length > 0 ? barList(top) : '<p class="yr-card-label">No character activity in this period.</p>'}
            </div>
            <div class="yr-panel">
                <h3 class="yr-panel-title">New vs. returning</h3>
                ${hasSplit ? donut([
        { label: 'New', value: t.newCharacters },
        { label: 'Returning', value: t.returningCharacters },
    ], { centerLabel: formatNumber(t.newCharacters + t.returningCharacters) }) : '<p class="yr-card-label">Not shown for "All time".</p>'}
            </div>
        </div>
    `;
}
