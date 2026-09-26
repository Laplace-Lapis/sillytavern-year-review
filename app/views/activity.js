import { calendarHeatmap, lineSeries, hourHistogram } from '../charts.js';
import { formatNumber, formatDay, formatMonth } from '../format.js';

/**
 * Renders the activity section: monthly trend, calendar heatmap (single-year only), and
 * hour-of-day histogram.
 * @param {HTMLElement} section
 * @param {object} yearData One entry of summary.byYear.
 * @param {string} year The raw year key ('2024', 'all', or 'unknown').
 */
export function renderActivity(section, yearData, year) {
    const isSingleYear = /^\d+$/.test(year);

    const monthPoints = yearData.months.map((m) => ({ label: formatMonth(m.month), value: m.assistantMessages }));
    const streak = yearData.longestStreak;
    const busiest = yearData.busiestDay;

    section.innerHTML = `
        <h2 class="yr-section-title">Activity</h2>
        <div class="yr-two-col">
            <div class="yr-panel">
                <h3 class="yr-panel-title">Messages per month</h3>
                <div class="yr-scroll-x">${lineSeries(monthPoints)}</div>
            </div>
            <div class="yr-panel">
                <h3 class="yr-panel-title">Activity by hour of day</h3>
                ${hourHistogram(yearData.hours)}
            </div>
        </div>
        ${isSingleYear ? `
            <div class="yr-panel">
                <h3 class="yr-panel-title">Daily activity</h3>
                ${calendarHeatmap(yearData.days, Number(year))}
            </div>
        ` : ''}
        <div class="yr-card-grid">
            <div class="yr-card">
                <div class="yr-card-value">${formatNumber(streak.days)}</div>
                <div class="yr-card-label">Longest streak (days)${streak.start ? `, ${formatDay(streak.start)} – ${formatDay(streak.end)}` : ''}</div>
            </div>
            <div class="yr-card">
                <div class="yr-card-value">${formatNumber(busiest.count)}</div>
                <div class="yr-card-label">Busiest day${busiest.day ? `, ${formatDay(busiest.day)}` : ''}</div>
            </div>
        </div>
    `;
}
