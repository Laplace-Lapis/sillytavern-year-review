# Year Review

A "Steam Year in Review"-esque view for SillyTavern chats: pick a calendar year and see which characters you
spent time with, how much you wrote, which providers and models you used, and a handful of
other metrics — all derived from your own chat history.

## How it works

Opens as a standalone browser tab (via the **Open Year Review** button in the extension's
settings drawer), separate from the main SillyTavern UI.

This extension does not track your chat live. Instead you need to click **Rebuild cache** to 
scan your chat history and force update. That scan reads every chat file once, 
dedupes branch/bookmark copies, and builds a compact per-character cache. 
On later rebuilds, only characters whose chats actually changed (by message count,
last-message time, and file size) are re-read — an unchanged library rescans much faster than initial scan.
A full cold rebuild over a large library (hundreds of characters, thousands of chats) can take up to several
minutes; a progress bar and a **Cancel** button are shown during that time.

WARNING: Group chats are not included into scan. (Maybe in later version?)

## Configuration

- **Scan concurrency** — defines how many chat files are read in parallel during a rebuild (1–16,
  default 6). Higher values rebuild faster but load the SillyTavern server more heavily while a
  rebuild is running.
- **Clear cache** — deletes the cached scan data. The next tab open shows the empty state until
  you rebuild. There is little reason to use it unless you corrupted your cache somehow and need a clean start

## Extension compatibility

Self-contained. It reads chat, character, and tag data through the same REST API the main
SillyTavern UI uses, and writes only its own two cache files under your user data directory on the server
via same API. No conflicts expected with other extensions.

## Security guarantees

Read-only against your chat/character data — it never modifies a chat, character, or setting
other than its own `extension_settings` entry (scan concurrency, last-scan timestamp) and its two
cache files. No external network calls; everything stays on your own SillyTavern server.

## How to install

Use this URL with the extension installer: `https://github.com/Laplace-Lapis/sillytavern-year-review`

## License

AGPLv3

## Changelog

0.3.0 - top-5 character avatar podium in the Characters section; new-vs-returning is now a
legend with both counts instead of a single center number; new characters are marked in the
top-characters list; the API donut and its monthly breakdown now use matching colors, with a
legend on the donut; fixed the "Messages per month" chart skipping zero-activity months and
squeezing "All time" into the same width as a single year (it now scrolls); daily activity grid
now shows outlines by default; hour-of-day chart has axis labels.

0.2.0 - changed digest to have separate across all years count rather then sum per year counts, which was double counting multi-year chats. 
