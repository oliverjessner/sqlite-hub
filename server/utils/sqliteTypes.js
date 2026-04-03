const { Buffer } = require("node:buffer");

function normalizeDeclaredType(type) {
  const declaredType = String(type ?? "").trim().toUpperCase();

  if (!declaredType) {
    return {
      declaredType: "",
      affinity: "BLOB",
    };
  }

  if (declaredType.includes("INT")) {
    return { declaredType, affinity: "INTEGER" };
  }

  if (
    declaredType.includes("CHAR") ||
    declaredType.includes("CLOB") ||
    declaredType.includes("TEXT")
  ) {
    return { declaredType, affinity: "TEXT" };
  }

  if (declaredType.includes("BLOB")) {
    return { declaredType, affinity: "BLOB" };
  }

  if (
    declaredType.includes("REAL") ||
    declaredType.includes("FLOA") ||
    declaredType.includes("DOUB")
  ) {
    return { declaredType, affinity: "REAL" };
  }

  return { declaredType, affinity: "NUMERIC" };
}

function serializeBlob(buffer) {
  return {
    __type: "blob",
    sizeBytes: buffer.length,
    hexPreview: buffer.subarray(0, 16).toString("hex"),
    base64Preview: buffer.subarray(0, 24).toString("base64"),
  };
}

function serializeSqliteValue(value) {
  if (Buffer.isBuffer(value)) {
    return serializeBlob(value);
  }

  if (value instanceof Uint8Array) {
    return serializeBlob(Buffer.from(value));
  }

  return value;
}

function serializeRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, serializeSqliteValue(value)])
  );
}

function serializeRows(rows) {
  return rows.map((row) => serializeRow(row));
}

function decodeBlobPayload(payload) {
  const encoding = payload.encoding ?? "base64";
  const rawData = payload.data ?? payload.value ?? "";

  if (typeof rawData !== "string") {
    throw new Error("BLOB payload data must be a string.");
  }

  if (encoding === "hex") {
    return Buffer.from(rawData, "hex");
  }

  if (encoding === "base64") {
    return Buffer.from(rawData, "base64");
  }

  throw new Error(`Unsupported BLOB encoding: ${encoding}`);
}

function deserializeSqliteValue(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value && typeof value === "object" && value.__type === "blob") {
    return decodeBlobPayload(value);
  }

  if (Array.isArray(value) || (value && typeof value === "object")) {
    return JSON.stringify(value);
  }

  return value;
}

module.exports = {
  deserializeSqliteValue,
  normalizeDeclaredType,
  serializeRow,
  serializeRows,
  serializeSqliteValue,
};
