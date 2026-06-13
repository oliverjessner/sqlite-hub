const { AppError } = require("../utils/errors");

const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1"]);
const LOOPBACK_HOST = "127.0.0.1";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function parseHost(value) {
  try {
    return new URL(`http://${String(value ?? "").trim()}`);
  } catch (error) {
    return null;
  }
}

function isLocalHostname(hostname) {
  return LOCAL_HOSTNAMES.has(String(hostname ?? "").replace(/^\[|\]$/g, "").toLowerCase());
}

function createLocalRequestError(message) {
  return new AppError(message, 403, {
    code: "LOCAL_REQUEST_REQUIRED",
  });
}

function listenOnLoopback(app, port) {
  return app.listen(port, LOOPBACK_HOST);
}

function localRequestSecurity(req, res, next) {
  const requestHost = parseHost(req.get("host"));

  if (!requestHost || !isLocalHostname(requestHost.hostname)) {
    next(createLocalRequestError("SQLite Hub only accepts requests addressed to localhost."));
    return;
  }

  if (!MUTATING_METHODS.has(req.method)) {
    next();
    return;
  }

  if (String(req.get("sec-fetch-site") ?? "").toLowerCase() === "cross-site") {
    next(createLocalRequestError("Cross-site API requests are not allowed."));
    return;
  }

  const origin = String(req.get("origin") ?? "").trim();

  // CLI and other non-browser clients do not send Origin. Browser requests must be same-origin.
  if (!origin) {
    next();
    return;
  }

  let parsedOrigin;

  try {
    parsedOrigin = new URL(origin);
  } catch (error) {
    next(createLocalRequestError("API request origin is invalid."));
    return;
  }

  if (
    !isLocalHostname(parsedOrigin.hostname) ||
    parsedOrigin.host.toLowerCase() !== requestHost.host.toLowerCase() ||
    parsedOrigin.protocol !== `${req.protocol}:`
  ) {
    next(createLocalRequestError("Cross-origin API requests are not allowed."));
    return;
  }

  next();
}

module.exports = {
  LOCAL_HOSTNAMES,
  LOOPBACK_HOST,
  MUTATING_METHODS,
  isLocalHostname,
  listenOnLoopback,
  localRequestSecurity,
  parseHost,
};
