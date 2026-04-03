const { ValidationError } = require("./errors");

function assertValidIdentifier(identifier, label = "Identifier") {
  if (typeof identifier !== "string" || !identifier.trim()) {
    throw new ValidationError(`${label} is required.`);
  }

  if (identifier.includes("\0")) {
    throw new ValidationError(`${label} contains invalid characters.`);
  }

  return identifier;
}

function quoteIdentifier(identifier) {
  return `"${assertValidIdentifier(identifier).replaceAll('"', '""')}"`;
}

function ensureKnownIdentifier(identifier, allowed, label = "Identifier") {
  assertValidIdentifier(identifier, label);

  if (!allowed.includes(identifier)) {
    throw new ValidationError(`${label} is not part of the current SQLite schema.`);
  }

  return identifier;
}

function quoteIdentifierList(identifiers) {
  return identifiers.map((identifier) => quoteIdentifier(identifier)).join(", ");
}

module.exports = {
  assertValidIdentifier,
  ensureKnownIdentifier,
  quoteIdentifier,
  quoteIdentifierList,
};
