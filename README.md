# Repo Analyzer (Browser Extension)

Repo Analyzer is a Manifest V3 browser extension that analyzes GitHub repositories **from the current page** and shows a compact summary in the popup.

**Version 5.0.0** focuses on XSS-safe rendering, harder scraping, a clarified health score, UX polish, and a small automated test suite — still **local-first** with **no API key required**.

## Highlights

- Manifest V3 (no inline scripts)
- Works on public GitHub repository pages (private repos only if your browser session can see them)
- Popup shows description, stars/forks/issues, license, top languages, contributors, and health score with factor chips
- **Copy JSON** export of the current analysis
- No backend; optional contributors page fetch stays on github.com

## Installation (Load Unpacked)

1. Open chrome extensions page (`chrome://extensions` or equivalent).
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `browser-extension/` folder from this repository.
5. Open a GitHub repository page and click the extension icon.

### Packaged zip (optional)

```bash
npm run package
```

Creates `dist/repo-analyzer-5.0.0.zip` (contents of `browser-extension/`).

## Usage

1. Navigate to any GitHub repository (for example: `https://github.com/owner/repo`).
2. Click the Repo Analyzer icon.
3. Review stats, languages, contributors, and health score.
4. Optionally click **Copy JSON** to copy a structured report to the clipboard.

## Health Score

Implemented in `browser-extension/shared.js` (`calcHealth`). It is a **lightweight heuristic**, not a security or quality audit.

Approximate factor caps (sum clamped to **0-100**):

| Factor | Max | Idea |
|--------|-----|------|
| Stars | 40 | log10(stars + 1) scaled — large repos do not explode the score |
| Forks | 25 | Same log-style scaling |
| Issue load | 20 | Fewer open issues -> higher points |
| Freshness | 15 | Decays as days since last visible update grow |

The popup shows these factor chips plus an approximate updated-ago hint when available.

## Security notes (5.0)

- Popup UI is built with **DOM APIs** (`textContent` / `createElement`), not string `innerHTML` from page data.
- Avatar URLs must be `https` on GitHub-related hosts (`avatars.githubusercontent.com`, `github.com`, etc.); otherwise a safe fallback is used.
- Contributor enrichment parses HTML in an isolated `DOMParser` and only keeps normalized logins + sanitized avatars; fetch is time-bounded and failure-tolerant.

## Project structure

```text
.
|-- browser-extension/
|   |-- manifest.json
|   |-- shared.js
|   |-- content.js
|   |-- popup.html
|   |-- popup.js
|   |-- icon-16.png ... icon-128.png
|-- tests/helpers.test.js
|-- scripts/package-extension.mjs
|-- PRIVACY.md
|-- package.json
`-- README.md
```

## Development

```bash
npm test                 # Node built-in test runner
npm run package          # zip browser-extension -> dist/
```

After editing extension files, reload the unpacked extension, then hard-refresh the GitHub tab if the content script looks stale.

## Privacy

See [PRIVACY.md](./PRIVACY.md). Short version: data stays in your browser; no telemetry backend.

## Limitations

- GitHub DOM/layout changes can break or weaken selectors.
- Some metadata (license, languages, contributors) may be missing or delayed in the UI.
- SPA navigations are handled by re-scraping on popup open; if the content script is missing, the popup tries a one-shot inject (`scripting` permission).
- Private repositories depend on your signed-in browser session.
- Health score is intentionally simple and can disagree with human judgment.

## Roadmap ideas

- Improved trend metrics (commit velocity, issue closure rate) if detectable from the page
- Optional GitHub API mode (default off) for higher reliability when a token is supplied

## Contributing

Issues and pull requests are welcome. Please include reproduction steps, expected vs actual behavior, and the repository URL used for testing.
