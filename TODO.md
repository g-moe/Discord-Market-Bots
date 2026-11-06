# TODO

## Turn off Message Content for Market Wizard

Market Wizard no longer reads messages, so it doesn't need this permission.

- In the Discord Developer Portal, open Market Wizard → Bot and turn off Message Content.

## Retire the old FinancialJuice relay bot

Market Wizard now gets headlines from FinancialJuice directly.

- Remove the old relay bot that posts in channel `1248771982980284436`.

## Confirm breaking news posts

No breaking headline has come through since the switch.

- When one does, check that it posts with the 🚨 title and also shows up in the trading chat.

## Clean up the server .env

Two keys on the droplet aren't used anymore.

- Remove `REDIS_PASSWORD` and `TRADINGVIEW_TOKEN` from `services/.env`.

## Keep log files from growing forever

Docker only trims the console output. Both bots also write `./logs/app.log` and `./logs/error.log`, and nothing trims those.

- Either stop writing log files and rely on Docker's logs, or rotate the files.
