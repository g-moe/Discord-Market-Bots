# TODO

## Upgrade Puppeteer

Market Wizard uses Puppeteer 22.3.0 to screenshot heatmaps.

- It's driving a much newer Chrome than it supports, so `/heatmap` is likely to break first.
- Upgrade to 25.16.0.
- After upgrading, check that `/heatmap` still works.
