import { formatNumber, formatDuration, formatDate } from '../format.js';

function entry(label, valueHtml) {
    return `<div class="yr-superlative"><span class="yr-superlative-label">${label}</span><span>${valueHtml}</span></div>`;
}

/**
 * Renders the Steam-review-style superlative callouts for the selected year.
 * @param {HTMLElement} section
 * @param {object} yearData One entry of summary.byYear.
 */
export function renderSuperlatives(section, yearData) {
    const sup = yearData.superlatives;
    const rows = [];

    if (sup.longestMessage) {
        const m = sup.longestMessage;
        rows.push(entry('Longest message', `${formatNumber(m.len)} characters — ${m.character}, ${formatDate(m.date)}`));
    }
    if (sup.longestChat) {
        const c = sup.longestChat;
        rows.push(entry('Longest chat', `${formatNumber(c.messages)} messages — ${c.character}`));
    }
    if (sup.mostSwipes) {
        const s = sup.mostSwipes;
        rows.push(entry('Most swiped message', `${formatNumber(s.count)} extra swipes — ${s.character}, ${formatDate(s.date)}`));
    }
    if (sup.longestGen) {
        const g = sup.longestGen;
        rows.push(entry('Longest single generation', `${formatDuration(g.ms)} — ${g.character}, ${formatDate(g.date)}`));
    }
    if (sup.bigWordDay) {
        const d = sup.bigWordDay;
        rows.push(entry('Biggest writing day', `${formatNumber(d.words)} words — ${d.character}`));
    }

    section.innerHTML = `
        <h2 class="yr-section-title">Superlatives</h2>
        <div class="yr-panel">
            <div class="yr-superlative-list">
                ${rows.length > 0 ? rows.join('') : '<p class="yr-card-label">Not enough data yet.</p>'}
            </div>
        </div>
    `;
}
