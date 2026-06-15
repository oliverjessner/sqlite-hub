const { AuthenticationError } = require("../utils/errors");

function readBearerToken(authorizationHeader) {
  const match = String(authorizationHeader ?? "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
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
