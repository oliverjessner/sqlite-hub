const { AuthenticationError } = require("../utils/errors");

function readBearerToken(authorizationHeader) {
  const header = String(authorizationHeader ?? "");

  if (
    header.length <= "Bearer".length ||
    header.slice(0, "Bearer".length).toLowerCase() !== "bearer" ||
    header.includes("\r") ||
    header.includes("\n")
  ) {
    return "";
  }

  const credentials = header.slice("Bearer".length);

  if (credentials.trimStart() === credentials) {
    return "";
  }

  return credentials.trim();
}

function createApiTokenAuth({ tokenService }) {
  return (req, res, next) => {
    try {
      const token = readBearerToken(req.get("authorization"));

      if (!token) {
        throw new AuthenticationError("Bearer API token is required.", {
          code: "API_TOKEN_REQUIRED",
        });
      }

      req.apiToken = tokenService.authenticate(req.params.databaseId, token);
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  createApiTokenAuth,
  readBearerToken,
};
