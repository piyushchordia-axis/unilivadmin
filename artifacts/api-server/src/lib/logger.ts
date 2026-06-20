import pino from "pino";

// Pretty logging is OPT-IN for explicit local development only. Everywhere else
// — production AND any unset/unexpected NODE_ENV — we log plain JSON to stdout.
// pino-pretty runs in a worker thread (thread-stream-worker.mjs) that the slim
// production bundle doesn't ship; defaulting to it whenever NODE_ENV !== production
// meant a missing/misconfigured NODE_ENV crashed the container on boot. Opting in
// (rather than opting out) makes a bad NODE_ENV degrade to JSON, never crash.
const usePrettyLogs = process.env.NODE_ENV === "development";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(usePrettyLogs
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }
    : {}),
});
