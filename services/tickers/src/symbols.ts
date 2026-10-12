const ymSymbols = new Set(["CBOT:YM1!", "CBOT_MINI:YM1!"]);

export function tickerSymbolsMatch(configuredSymbol: string, receivedSymbol: unknown): boolean {
  if (typeof receivedSymbol !== "string") return false;

  // The live webhook and existing bot config use different YM exchange prefixes.
  return configuredSymbol === receivedSymbol ||
    (ymSymbols.has(configuredSymbol) && ymSymbols.has(receivedSymbol));
}
