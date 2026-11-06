# TODO

## Python webhook server

`services/server` runs on end-of-life tooling.

- `services/dockerfile.server` uses `python:3.10.22-slim`; Python 3.10 reached end of life in October 2026. Move to 3.12 or later.
- `CMD ["python", "app.py"]` runs Flask's development server in production; the gunicorn `CMD` is commented out. Switch to gunicorn 22 or later.
- `services/server/.requirements.txt` lists `gunicorn==21.2.0` (unused, GHSA-hc5x-x2vx-497g request smuggling, fixed in 22.0.0) and `Flask-Limiter` (never imported by `app.py`).
- The image build logs a pip conflict: the base image's `wheel 0.46.3` requires `packaging>=24.0`, but `.requirements.txt` pins `packaging==23.2`.

## Puppeteer upgrade

`services/market-wiz` pins `puppeteer` 22.3.0.

- It drives whatever `google-chrome-stable` apt installs today, far newer than the Chrome it supports, so `/heatmap` is the first thing to break.
- `npm audit --omit=dev` reports 1 critical and 8 high; real exposure is low because the affected code is the browser download (skipped) and proxy paths.
- 25.16.0 (released 2026-10-22) clears `min-release-age=7`. Check the launch options and `page.screenshot` API in `services/market-wiz/src/commands/heatmap.ts` after upgrading.
