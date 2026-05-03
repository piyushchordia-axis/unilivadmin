import app from "./app";
import { logger } from "./lib/logger";
import { runSlaCheck } from "./routes/complaints.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // SLA breach check every 5 minutes
  const slaInterval = setInterval(() => {
    runSlaCheck().catch((e) => logger.error({ err: e }, "SLA check failed"));
  }, 5 * 60 * 1000);
  // Run once on startup
  runSlaCheck().catch((e) => logger.error({ err: e }, "SLA check failed"));
  process.on("SIGTERM", () => clearInterval(slaInterval));
});
