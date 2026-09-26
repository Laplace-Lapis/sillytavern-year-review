// Small display-formatting helpers shared by the views.

/**
 * Formats a count with thousands separators.
 * @param {number} value
 * @returns {string}
 */
export function formatNumber(value) {
    return new Intl.NumberFormat().format(Math.round(value ?? 0));
}

/**
 * Formats a millisecond duration as a human-friendly "Xh Ym" / "Xd Yh" string.
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
    if (!ms || ms <= 0) {
        return '0m';
    }
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    if (hours < 24) {
        return `${hours}h ${remMinutes}m`;
    }
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${remHours}h`;
}

/**
 * Formats a 'YYYY-MM-DD' day key as a short readable date.
 * @param {string|null} dayKey
 * @returns {string}
 */
export function formatDay(dayKey) {
    if (!dayKey) {
        return '—';
    }
    const [year, month, day] = dayKey.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Formats a millisecond timestamp as a short readable date, or an em-dash if null.
 * @param {number|null} ms
 * @returns {string}
 */
export function formatDate(ms) {
    if (ms === null || ms === undefined) {
        return '—';
    }
    return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Formats a 'YYYY-MM' month key as a short month label.
 * @param {string} monthKey
 * @returns {string}
 */
export function formatMonth(monthKey) {
    const [year, month] = monthKey.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}
