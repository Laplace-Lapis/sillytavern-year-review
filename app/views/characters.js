import { barList, donut, legend, escapeAttr } from '../charts.js';
import { formatNumber } from '../format.js';

// 'New' matches the accent color used for the new-character badge dot in the bar list below,
// so the two visuals read as the same concept; 'Returning' gets the default accent blue.
const NEW_RETURNING_COLOR_MAP = new Map([
    ['New', 'var(--yr-new-color)'],
    ['Returning', 'var(--yr-series-1)'],
]);

const LEADERBOARD_SIZE = 5;
// Visual left-to-right order for a 5-wide podium: 4th, 2nd, 1st (center, biggest), 3rd, 5th.
const PODIUM_ORDER = [4, 2, 1, 3, 5];

/**
 * Builds the URL for a character's avatar thumbnail. Same-origin GET, no CSRF needed (see
 * src/endpoints/thumbnails.js's public thumbnail route) — this is the same endpoint the main
 * SillyTavern UI uses for avatar images.
 * @param {string} avatar Avatar filename, e.g. 'Seraphina.png'.
 * @returns {string}
 */
function avatarThumbnailUrl(avatar) {
    return `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`;
}

/**
 * Renders the top-5 characters as a podium of avatar portraits (rank 1 largest with a gold
 * border, 2nd silver, 3rd bronze), in visual order 4th–2nd–1st–3rd–5th — a bit of "pazazz"
 * modeled on how SillyTavern-CharacterLibrary highlights favorites.
 * @param {Array<{avatar: string, name: string, messages: number}>} ranked Already sorted
 *   descending by messages; only the first `LEADERBOARD_SIZE` are used.
 * @returns {string} HTML markup.
 */
function renderLeaderboard(ranked) {
    const top = ranked.slice(0, LEADERBOARD_SIZE);
    if (top.length === 0) {
        return '';
    }
    // top[0] is rank 1; PODIUM_ORDER lists ranks (1-indexed) in the desired left-to-right
    // DOM order, skipping any rank beyond how many characters actually exist.
    const items = PODIUM_ORDER
        .filter((rank) => rank <= top.length)
        .map((rank) => {
            const character = top[rank - 1];
            return `
                <div class="yr-leaderboard-item" data-rank="${rank}">
                    <img class="yr-leaderboard-avatar" src="${avatarThumbnailUrl(character.avatar)}" alt="${escapeAttr(character.name)}" loading="lazy" onerror="this.style.opacity='0'">
                    <div class="yr-leaderboard-rank">#${rank}</div>
                    <div class="yr-leaderboard-name">${escapeAttr(character.name)}</div>
                    <div class="yr-leaderboard-count">${formatNumber(character.messages)} msgs</div>
                </div>
            `;
        }).join('');
    return `<div class="yr-leaderboard">${items}</div>`;
}

/**
 * Renders the character leaderboard, top-characters bar list, and new-vs-returning donut.
 * @param {HTMLElement} section
 * @param {object} yearData One entry of summary.byYear.
 */
export function renderCharacters(section, yearData) {
    const ranked = yearData.characters;
    const top = ranked.slice(0, 10).map((c) => ({
        label: c.name,
        value: c.messages,
        // isNew is undefined for "all" (see aggregate.js) — no badge there, which is correct:
        // every character is trivially "new" at some point across all-time, so the badge
        // would be meaningless noise.
        badge: c.isNew ? 'new' : undefined,
    }));
    const t = yearData.totals;
    const hasSplit = t.newCharacters + t.returningCharacters > 0;

    section.innerHTML = `
        <h2 class="yr-section-title">Characters</h2>
        ${renderLeaderboard(ranked)}
        <div class="yr-two-col">
            <div class="yr-panel">
                <h3 class="yr-panel-title">Top characters by messages</h3>
                ${top.length > 0 ? barList(top) : '<p class="yr-card-label">No character activity in this period.</p>'}
                ${top.some((item) => item.badge) ? '<p class="yr-card-label">● marks a character new this year.</p>' : ''}
            </div>
            <div class="yr-panel">
                <h3 class="yr-panel-title">New vs. returning</h3>
                ${hasSplit ? `
                    <div class="yr-donut-block">
                        ${donut([
        { label: 'New', value: t.newCharacters },
        { label: 'Returning', value: t.returningCharacters },
    ], { centerLabel: formatNumber(t.newCharacters + t.returningCharacters), colorMap: NEW_RETURNING_COLOR_MAP })}
                        ${legend([
        { label: 'New', value: t.newCharacters },
        { label: 'Returning', value: t.returningCharacters },
    ], { colorMap: NEW_RETURNING_COLOR_MAP })}
                    </div>
                ` : '<p class="yr-card-label">Not shown for "All time" — every character is trivially "new" at some point across all-time.</p>'}
            </div>
        </div>
    `;
}
