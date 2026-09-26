const MODULE_NAME = 'yearReview';                            // extension_settings key (camelCase)
const EXT_PATH = 'third-party/sillytavern-year-review';       // for renderExtensionTemplateAsync

const DEFAULT_SETTINGS = {
    concurrency: 6,
    lastScan: null,
    cacheVersion: null,
};

/**
 * Finds the URL this extension's own script was served from, so the standalone app can be
 * opened whether the extension is installed globally or per-user.
 * @returns {string} Base URL of this extension's directory (no trailing slash).
 */
function getExtensionUrl() {
    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
        if (scripts[i].src && scripts[i].src.includes('sillytavern-year-review')) {
            const path = scripts[i].src;
            return path.substring(0, path.lastIndexOf('/'));
        }
    }
    return 'scripts/extensions/third-party/sillytavern-year-review';
}

// Pre-fetched at load so the token is already in hand by the time the user clicks "Open".
// Re-fetched on open too, so it recovers after an ST server restart invalidates the old one.
let cachedCsrfToken = null;

async function fetchCsrfToken() {
    try {
        const response = await fetch('/csrf-token');
        if (response.ok) {
            const data = await response.json();
            cachedCsrfToken = data.token;
        }
    } catch (error) {
        console.error('[Year Review] Failed to fetch CSRF token', error);
    }
    return cachedCsrfToken;
}

function ensureSettings() {
    const { extensionSettings } = SillyTavern.getContext();
    extensionSettings[MODULE_NAME] ??= {};
    extensionSettings[MODULE_NAME].concurrency ??= DEFAULT_SETTINGS.concurrency;
    extensionSettings[MODULE_NAME].lastScan ??= DEFAULT_SETTINGS.lastScan;
    extensionSettings[MODULE_NAME].cacheVersion ??= DEFAULT_SETTINGS.cacheVersion;
    return extensionSettings[MODULE_NAME];
}

function getSettings() {
    const { extensionSettings } = SillyTavern.getContext();
    return extensionSettings[MODULE_NAME];
}

function saveSettings() {
    SillyTavern.getContext().saveSettingsDebounced();
}

/**
 * Opens the standalone Year Review tab. Must be called synchronously from within a user
 * gesture (click handler) for window.open to succeed without a popup blocker.
 */
function openReviewTab() {
    const baseUrl = getExtensionUrl();

    if (cachedCsrfToken) {
        const url = `${baseUrl}/app/review.html?csrf=${encodeURIComponent(cachedCsrfToken)}`;
        if (!window.open(url, '_blank')) {
            showPopupBlockedToast(url);
        }
        return;
    }

    // Token isn't ready yet (rare). Open a placeholder synchronously to preserve the user
    // gesture, then navigate it once the token arrives.
    const tab = window.open('about:blank', '_blank');
    if (tab) {
        tab.document.open();
        tab.document.write('<!doctype html><title>Year Review</title><body style="background:#1a1a1a;color:#ddd;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">Loading…</body>');
        tab.document.close();
    }
    fetchCsrfToken().then((token) => {
        const url = `${baseUrl}/app/review.html?csrf=${encodeURIComponent(token || '')}`;
        if (tab && !tab.closed) {
            tab.location.href = url;
        } else {
            showPopupBlockedToast(url);
        }
    });
}

function showPopupBlockedToast(url) {
    const { t } = SillyTavern.getContext();
    toastr.info(t`Click to open Year Review`, t`Popup blocked`, {
        onclick: () => window.open(url, '_blank'),
        timeOut: 0,
        extendedTimeOut: 0,
    });
}

async function onOpenButtonClick() {
    openReviewTab();
}

function formatLastScan(lastScan) {
    const { t } = SillyTavern.getContext();
    if (!lastScan) {
        return t`Never scanned`;
    }
    return new Date(lastScan).toLocaleString();
}

async function renderSettingsPanel() {
    const { renderExtensionTemplateAsync } = SillyTavern.getContext();
    const settings = ensureSettings();
    const html = await renderExtensionTemplateAsync(EXT_PATH, 'settings', {
        settings,
        lastScanText: formatLastScan(settings.lastScan),
    });
    $('#extensions_settings2').append(html);

    $('#yearReviewOpenButton').on('click', onOpenButtonClick);
    $('#yearReviewConcurrency').val(settings.concurrency).on('change', function () {
        const value = Math.min(16, Math.max(1, parseInt($(this).val(), 10) || DEFAULT_SETTINGS.concurrency));
        getSettings().concurrency = value;
        saveSettings();
    });
}

function registerSlashCommand() {
    const context = SillyTavern.getContext();
    const parser = context.SlashCommandParser;
    const SlashCommand = context.SlashCommand;
    if (!parser?.addCommandObject || !SlashCommand?.fromProps) {
        return;
    }
    parser.addCommandObject(SlashCommand.fromProps({
        name: 'yearreview',
        helpString: 'Opens the Year Review tab.',
        callback: () => {
            openReviewTab();
            return '';
        },
    }));
}

export async function init() {
    ensureSettings();
    fetchCsrfToken();
    await renderSettingsPanel();
    registerSlashCommand();
}

jQuery(async () => {
    await init();
});
