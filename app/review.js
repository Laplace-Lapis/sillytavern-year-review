import { loadSummary } from './cache.js';
import { runScan } from './scanner.js';
import { notifyHost } from './api.js';
import { renderHero } from './views/hero.js';
import { renderActivity } from './views/activity.js';
import { renderCharacters } from './views/characters.js';
import { renderProviders } from './views/providers.js';
import { renderTags } from './views/tags.js';
import { renderSuperlatives } from './views/superlatives.js';

let summary = null;
let selectedYear = null;
let scanController = null;

const elements = {
    yearSwitcher: document.getElementById('yrYearSwitcher'),
    rebuildButton: document.getElementById('yrRebuildButton'),
    cancelButton: document.getElementById('yrCancelButton'),
    progress: document.getElementById('yrProgress'),
    progressFill: document.getElementById('yrProgressFill'),
    progressLabel: document.getElementById('yrProgressLabel'),
    emptyState: document.getElementById('yrEmptyState'),
    loadingState: document.getElementById('yrLoadingState'),
    sections: {
        hero: document.getElementById('yrHeroSection'),
        activity: document.getElementById('yrActivitySection'),
        characters: document.getElementById('yrCharactersSection'),
        providers: document.getElementById('yrProvidersSection'),
        tags: document.getElementById('yrTagsSection'),
        superlatives: document.getElementById('yrSuperlativesSection'),
    },
};

function setSectionsVisible(visible) {
    for (const section of Object.values(elements.sections)) {
        section.hidden = !visible;
    }
}

function renderYearSwitcher() {
    const years = [...summary.years];
    if (summary.hasUnknown) {
        years.push('unknown');
    }
    const options = [...years, 'all'];

    elements.yearSwitcher.innerHTML = options.map((year) => {
        const label = year === 'all' ? 'All time' : (year === 'unknown' ? 'Undated' : year);
        const isActive = year === selectedYear;
        return `<button type="button" class="yr-year-button${isActive ? ' is-active' : ''}" data-year="${year}">${label}</button>`;
    }).join('');

    elements.yearSwitcher.querySelectorAll('.yr-year-button').forEach((button) => {
        button.addEventListener('click', () => {
            selectedYear = button.dataset.year;
            renderSelectedYear();
        });
    });
}

function renderSelectedYear() {
    renderYearSwitcher();
    const yearData = summary.byYear[selectedYear];
    if (!yearData) {
        setSectionsVisible(false);
        return;
    }
    setSectionsVisible(true);
    const yearLabel = selectedYear === 'all' ? 'All time' : (selectedYear === 'unknown' ? 'Undated chats' : selectedYear);

    renderHero(elements.sections.hero, yearData, yearLabel);
    renderActivity(elements.sections.activity, yearData, selectedYear);
    renderCharacters(elements.sections.characters, yearData);
    renderProviders(elements.sections.providers, yearData);
    renderTags(elements.sections.tags, yearData);
    renderSuperlatives(elements.sections.superlatives, yearData);
}

function pickDefaultYear() {
    if (summary.years.length > 0) {
        return summary.years[summary.years.length - 1];
    }
    if (summary.hasUnknown) {
        return 'unknown';
    }
    return 'all';
}

function applySummary(newSummary) {
    summary = newSummary;
    const hasAnyData = summary && (summary.years.length > 0 || summary.hasUnknown);
    elements.loadingState.hidden = true;
    elements.emptyState.hidden = hasAnyData;
    setSectionsVisible(false);

    if (!hasAnyData) {
        return;
    }
    if (!selectedYear || !summary.byYear[selectedYear]) {
        selectedYear = pickDefaultYear();
    }
    renderSelectedYear();
}

function setProgress(progress) {
    if (progress.phase === 'done') {
        elements.progress.hidden = true;
        return;
    }
    elements.progress.hidden = false;
    const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
    elements.progressFill.style.width = `${percent}%`;

    const phaseLabels = {
        inventory: 'Reading chat inventory…',
        scanning: `Scanning characters (${progress.done}/${progress.total})${progress.currentCharacter ? ` — ${progress.currentCharacter}` : ''}`,
        reducing: 'Building summary…',
        saving: 'Saving cache…',
    };
    elements.progressLabel.textContent = phaseLabels[progress.phase] ?? '';
}

async function onRebuildClick() {
    scanController = new AbortController();
    elements.rebuildButton.disabled = true;
    elements.cancelButton.hidden = false;
    elements.loadingState.hidden = false;
    elements.emptyState.hidden = true;

    try {
        const newSummary = await runScan({
            signal: scanController.signal,
            onProgress: setProgress,
        });
        applySummary(newSummary);
        notifyHost('scan-complete', { scannedAt: newSummary.scannedAt });
    } catch (error) {
        if (error?.name !== 'AbortError') {
            console.error('[Year Review] Scan failed', error);
            elements.progressLabel.textContent = `Scan failed: ${error.message ?? error}`;
        } else {
            elements.progressLabel.textContent = 'Scan cancelled.';
        }
        elements.loadingState.hidden = true;
        if (summary) {
            applySummary(summary);
        } else {
            elements.emptyState.hidden = false;
        }
    } finally {
        elements.rebuildButton.disabled = false;
        elements.cancelButton.hidden = true;
        scanController = null;
        setTimeout(() => { elements.progress.hidden = true; }, 2000);
    }
}

function onCancelClick() {
    scanController?.abort();
}

async function init() {
    elements.rebuildButton.addEventListener('click', onRebuildClick);
    elements.cancelButton.addEventListener('click', onCancelClick);

    const cached = await loadSummary();
    elements.loadingState.hidden = true;
    if (cached) {
        applySummary(cached);
    } else {
        elements.emptyState.hidden = false;
    }
}

init();
