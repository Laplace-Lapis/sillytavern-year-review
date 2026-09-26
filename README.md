# Year Review

A "Steam Year in Review" for SillyTavern: pick a calendar year and see which characters you
spent time with, how much you wrote, which providers and models you used, and a handful of
superlatives — all derived from your own chat history.

## How it works

Opens as a standalone browser tab (via the **Open Year Review** button in the extension's
settings drawer), separate from the main SillyTavern UI, because it's used far less often than
most extensions.

Nothing is tracked automatically. Click **Rebuild cache** to scan your chat history; that scan
reads every chat file once, dedupes branch/bookmark copies, and builds a compact per-character
cache. On later rebuilds, only characters whose chats actually changed (by message count,
last-message time, and file size) are re-read — an unchanged library rescans in seconds. A full
cold rebuild over a large library (hundreds of characters, thousands of chats) can take several
minutes; a progress bar and a **Cancel** button are shown during that time.

Group chats are not included in this version.

## Configuration

- **Scan concurrency** — how many chat files are read in parallel during a rebuild (1–16,
  default 6). Higher values rebuild faster but load the SillyTavern server more heavily while a
  rebuild is running.
- **Clear cache** — deletes the cached scan data. The next tab open shows the empty state until
  you rebuild.

## Extension compatibility

Self-contained. It reads chat, character, and tag data through the same REST API the main
SillyTavern UI uses, and writes only its own two cache files under your user data directory. No
conflicts expected with other extensions.

## Security guarantees

Read-only against your chat/character data — it never modifies a chat, character, or setting
other than its own `extension_settings` entry (scan concurrency, last-scan timestamp) and its two
cache files. No external network calls; everything stays on your own SillyTavern server.

## How to install

Use this URL with the extension installer: `https://github.com/Laplace-Lapis/sillytavern-year-review`

## License

AGPLv3

## Changelog
