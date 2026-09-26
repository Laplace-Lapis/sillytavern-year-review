import { formatNumber, formatDuration } from '../format.js';

/**
 * Renders the top-of-page hero stat cards for the selected year.
 * @param {HTMLElement} section
 * @param {object} yearData One entry of summary.byYear.
 * @param {string} yearLabel Display label, e.g. '2024' or 'All time'.
 */
export function renderHero(section, yearData, yearLabel) {
    const t = yearData.totals;
    const cards = [
        { value: formatNumber(t.messages), label: 'Messages exchanged' },
        { value: formatNumber(t.words), label: 'Words written' },
        { value: formatNumber(t.characters), label: 'Characters' },
        { value: formatNumber(t.chats), label: 'Chats' },
        { value: formatNumber(t.activeDays), label: 'Active days' },
        { value: formatDuration(t.genTimeMs), label: 'Generation time' },
    ];

    section.innerHTML = `
        <h2 class="yr-section-title">${yearLabel} at a glance</h2>
        <div class="yr-card-grid">
            ${cards.map((card) => `
                <div class="yr-card">
                    <div class="yr-card-value">${card.value}</div>
                    <div class="yr-card-label">${card.label}</div>
                </div>
            `).join('')}
        </div>
    `;
}
