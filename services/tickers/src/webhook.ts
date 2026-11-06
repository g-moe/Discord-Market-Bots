import * as http from "http";
import logger from "./logger";

export const WEBHOOK_PATH = "/6YVpcd3QEwkdADX51KG4czHLd3NVcFs9";
export const WEBHOOK_PORT = 8000;

/**
 * Receive TradingView ticker updates over HTTP and hand each authorized one to `onTickerUpdate`.
 * Replies before running `onTickerUpdate`, because TradingView gives up on slow webhooks; update failures are logged.
 *
 * Accepts: `POST WEBHOOK_PATH` with a JSON body whose `Authorization` field equals `secret`.
 *
 * @example
 * const server = startWebhookServer({ onTickerUpdate: data => handleTickerUpdate({ data, tickers }), port: WEBHOOK_PORT, secret });
 */
export function startWebhookServer(params: {
  onTickerUpdate: (data: unknown) => Promise<void>;
  port: number;
  secret: string;
}): http.Server {
  const { onTickerUpdate, port, secret } = params;

  const server = http.createServer(async (req, res) => {
    if (req.url !== WEBHOOK_PATH) return reply({ res, status: 404, text: "Not found" });
    if (req.method !== "POST") return reply({ res, status: 405, text: "Method not allowed" });

    const data = await readJson(req);
    if (data === undefined) return reply({ res, status: 400, text: "Invalid JSON" });
    if (data.Authorization !== secret) return reply({ res, status: 401, text: "Unauthorized" });

    reply({ res, status: 200, text: "Webhook received successfully" });
    onTickerUpdate(data).catch(error => logger.error({ err: error }, "ticker update failed"));
  });

  server.listen(port, () => logger.info({ port }, "webhook server listening"));
  return server;
}

/**
 * Read a request body as a JSON object; `undefined` when it is too large, not JSON, or not an object.
 *
 * @example
 * await readJson(req); // { Authorization: "...", stocks: [...] }
 */
async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const MAX_BODY_BYTES = 1_000_000;

  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

/**
 * End a response with a status code and a plain-text body.
 *
 * @example
 * reply({ res, status: 401, text: "Unauthorized" });
 */
function reply({ res, status, text }: { res: http.ServerResponse; status: number; text: string }) {
  res.writeHead(status, { "Content-Type": "text/plain" }).end(text);
}
