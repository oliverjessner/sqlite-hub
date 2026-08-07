const { ValidationError } = require("../utils/errors");

const ALLOWED_PARSERS = new Set(["delimiter", "lines", "key-value", "csv", "tsv"]);
const ALLOWED_OUTPUTS = new Set(["json", "jsonl", "csv", "tsv", "markdown", "yaml", "sqlite"]);
const ALLOWED_SCHEMA_TYPES = new Set(["string", "integer", "float", "boolean", "date", "array"]);
const ALLOWED_ERROR_MODES = new Set(["throw", "skip", "collect"]);
const ALLOWED_TOP_LEVEL_KEYS = new Set([
  "input",
  "schema",
  "parser",
  "deduplicate",
  "errors",
  "output",
  "outputOptions",
]);
const ALLOWED_FIELD_KEYS = new Set([
  "type",
  "required",
  "trim",
  "separator",
  "primaryKey",
  "autoIncrement",
  "unique",
]);
const OUTPUT_OPTION_KEYS = {
  json: new Set(["pretty", "indent"]),
  jsonl: new Set(),
  csv: new Set(["header", "delimiter", "columns"]),
  tsv: new Set(["header", "delimiter", "columns"]),
  markdown: new Set(["columns"]),
  yaml: new Set(),
  sqlite: new Set(["table", "createTable", "columns"]),
};
const PROPERTY_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_INPUT_SIZE = 1024 * 1024;
const MAX_SCHEMA_FIELDS = 100;
const MAX_SCHEMA_SIZE = 64 * 1024;
const MAX_PROPERTY_NAME_LENGTH = 128;
const MAX_SEPARATOR_LENGTH = 16;
const MAX_TABLE_NAME_LENGTH = 128;

let structpastePromise;

function loadStructpaste() {
  if (!structpastePromise) {
    structpastePromise = import("structpaste");
  }

  return structpastePromise;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function fail(message, details = null) {
  throw new ValidationError(message, {
    code: "TEXT_TO_STRUCT_VALIDATION_ERROR",
    details,
  });
}

function assertAllowedKeys(value, allowedKeys, label) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      fail(`Unsupported ${label} property \"${key}\".`, { property: key });
    }
  }
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") {
    fail(`${label} must be a boolean.`);
  }
}

function validatePropertyName(rawName, label = "Schema property") {
  if (typeof rawName !== "string") {
    fail(`${label} must be a string.`);
  }

  const name = rawName.trim();

  if (!name || name !== rawName || name.length > MAX_PROPERTY_NAME_LENGTH || !PROPERTY_NAME_PATTERN.test(name)) {
    fail(`${label} \"${rawName}\" is invalid. Use letters, numbers, and underscores, starting with a letter or underscore.`);
  }

  return name;
}

function validateSeparator(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > MAX_SEPARATOR_LENGTH) {
    fail(`${label} must contain between 1 and ${MAX_SEPARATOR_LENGTH} characters.`);
  }

  return value;
}

function normalizeField(name, definition) {
  if (typeof definition === "string") {
    if (!ALLOWED_SCHEMA_TYPES.has(definition)) {
      fail(`Unsupported schema type \"${definition}\" for property \"${name}\".`);
    }

    return definition;
  }

  if (!isPlainObject(definition)) {
    fail(`Schema definition for property \"${name}\" must be a type or an object.`);
  }

  assertAllowedKeys(definition, ALLOWED_FIELD_KEYS, `schema field \"${name}\"`);

  const field = { ...definition };
  field.type = field.type ?? "string";

  if (!ALLOWED_SCHEMA_TYPES.has(field.type)) {
    fail(`Unsupported schema type \"${field.type}\" for property \"${name}\".`);
  }

  for (const flag of ["required", "trim", "primaryKey", "autoIncrement", "unique"]) {
    if (field[flag] !== undefined) {
      assertBoolean(field[flag], `Schema field ${name}.${flag}`);
    }
  }

  if (field.separator !== undefined) {
    validateSeparator(field.separator, `Schema field ${name}.separator`);
  }

  if (field.autoIncrement && (!field.primaryKey || field.type !== "integer")) {
    fail(`Schema field \"${name}\" can only auto increment when it is an integer primary key.`);
  }

  return field;
}

function normalizeSchema(schema) {
  if (!isPlainObject(schema)) {
    fail("schema must be an object.");
  }

  let serializedSchema;
  try {
    serializedSchema = JSON.stringify(schema);
  } catch {
    fail("schema must be JSON serializable.");
  }

  if (Buffer.byteLength(serializedSchema, "utf8") > MAX_SCHEMA_SIZE) {
    fail(`schema must not exceed ${MAX_SCHEMA_SIZE} bytes.`);
  }

  const entries = Object.entries(schema);
  if (entries.length < 1 || entries.length > MAX_SCHEMA_FIELDS) {
    fail(`schema must contain between 1 and ${MAX_SCHEMA_FIELDS} fields.`);
  }

  return Object.fromEntries(
    entries.map(([rawName, definition]) => {
      const name = validatePropertyName(rawName);
      return [name, normalizeField(name, definition)];
    })
  );
}

function normalizeParser(parser) {
  if (!isPlainObject(parser)) {
    fail("parser must be an object.");
  }

  const type = parser.type;
  if (!ALLOWED_PARSERS.has(type)) {
    fail(`Unsupported parser type \"${type}\".`);
  }

  const allowedKeys = new Set(["type"]);
  if (type === "delimiter") allowedKeys.add("delimiter");
  if (type === "key-value") allowedKeys.add("separator");
  if (type === "csv" || type === "tsv") allowedKeys.add("header");
  assertAllowedKeys(parser, allowedKeys, "parser");

  const normalized = { type };

  if (type === "delimiter") {
    normalized.delimiter = validateSeparator(parser.delimiter ?? "|", "parser.delimiter");
  } else if (type === "key-value") {
    normalized.separator = validateSeparator(parser.separator ?? ":", "parser.separator");
  } else if (type === "csv" || type === "tsv") {
    const header = parser.header ?? true;
    assertBoolean(header, "parser.header");
    normalized.header = header;
  }

  return normalized;
}

function normalizeDeduplicate(value, schema) {
  if (value === undefined || value === false || value === true) {
    return value ?? false;
  }

  if (!Array.isArray(value) || value.length < 1) {
    fail("deduplicate must be a boolean or a non-empty array of schema properties.");
  }

  const fields = value.map(field => validatePropertyName(field, "Deduplication property"));
  if (new Set(fields).size !== fields.length) {
    fail("deduplicate properties must be unique.");
  }

  for (const field of fields) {
    if (!Object.hasOwn(schema, field)) {
      fail(`Deduplication property \"${field}\" is not present in the schema.`);
    }
  }

  return fields;
}

function normalizeColumns(columns, schema) {
  if (!Array.isArray(columns) || columns.length < 1) {
    fail("outputOptions.columns must be a non-empty array of schema properties.");
  }

  const normalized = columns.map(column => validatePropertyName(column, "Output column"));
  if (new Set(normalized).size !== normalized.length) {
    fail("outputOptions.columns must be unique.");
  }

  for (const column of normalized) {
    if (!Object.hasOwn(schema, column)) {
      fail(`Output column \"${column}\" is not present in the schema.`);
    }
  }

  return normalized;
}

function normalizeTableName(value) {
  if (typeof value !== "string") {
    fail("outputOptions.table must be a string.");
  }

  const table = value.trim();
  if (!table || table !== value || table.length > MAX_TABLE_NAME_LENGTH || !PROPERTY_NAME_PATTERN.test(table)) {
    fail("outputOptions.table must be a valid SQLite identifier using letters, numbers, and underscores.");
  }

  return table;
}

function normalizeOutputOptions(options, output, schema) {
  if (options === undefined) {
    options = {};
  }

  if (!isPlainObject(options)) {
    fail("outputOptions must be an object.");
  }

  assertAllowedKeys(options, OUTPUT_OPTION_KEYS[output], `${output} output option`);

  const normalized = {};

  if (options.columns !== undefined) {
    normalized.columns = normalizeColumns(options.columns, schema);
  }

  if (options.header !== undefined) {
    assertBoolean(options.header, "outputOptions.header");
    normalized.header = options.header;
  }

  if (options.pretty !== undefined) {
    assertBoolean(options.pretty, "outputOptions.pretty");
    normalized.pretty = options.pretty;
  }

  if (options.indent !== undefined) {
    if (!Number.isInteger(options.indent) || options.indent < 0 || options.indent > 8) {
      fail("outputOptions.indent must be an integer from 0 to 8.");
    }
    normalized.indent = options.indent;
  }

  if (options.delimiter !== undefined) {
    normalized.delimiter = validateSeparator(options.delimiter, "outputOptions.delimiter");
  }

  if (output === "sqlite") {
    normalized.table = normalizeTableName(options.table ?? "items");
    const createTable = options.createTable ?? true;
    assertBoolean(createTable, "outputOptions.createTable");
    normalized.createTable = createTable;
  } else if (options.table !== undefined || options.createTable !== undefined) {
    fail("SQLite table options are only supported for SQLite output.");
  }

  return normalized;
}

function normalizeRequest(payload) {
  if (!isPlainObject(payload)) {
    fail("Request body must be an object.");
  }

  assertAllowedKeys(payload, ALLOWED_TOP_LEVEL_KEYS, "request");

  if (typeof payload.input !== "string") {
    fail("input must be a string.");
  }

  if (Buffer.byteLength(payload.input, "utf8") > MAX_INPUT_SIZE) {
    fail(`input must not exceed ${MAX_INPUT_SIZE} bytes.`);
  }

  const schema = normalizeSchema(payload.schema);
  const parser = normalizeParser(payload.parser);
  const output = payload.output ?? "json";
  const errors = payload.errors ?? "collect";

  if (!ALLOWED_OUTPUTS.has(output)) {
    fail(`Unsupported output format \"${output}\".`);
  }

  if (!ALLOWED_ERROR_MODES.has(errors)) {
    fail(`Unsupported error strategy \"${errors}\".`);
  }

  return {
    input: payload.input,
    schema,
    parser,
    deduplicate: normalizeDeduplicate(payload.deduplicate, schema),
    errors,
    output,
    outputOptions: normalizeOutputOptions(payload.outputOptions, output, schema),
  };
}

function normalizeLibraryError(error) {
  if (error instanceof ValidationError) {
    return error;
  }

  const details = error?.name === "StructPasteError"
    ? {
        row: error.row,
        property: error.property,
        value: error.value,
        code: error.code,
      }
    : null;

  return new ValidationError(error?.message || "Text conversion failed.", {
    code: error?.code || "TEXT_TO_STRUCT_CONVERSION_ERROR",
    details,
  });
}

class TextToStructService {
  constructor(options = {}) {
    this.loadLibrary = options.loadLibrary ?? loadStructpaste;
  }

  async convert(payload) {
    const options = normalizeRequest(payload);

    try {
      const structpaste = await this.loadLibrary();
      const parsed = structpaste.parse(options.input, {
        schema: options.schema,
        parser: options.parser,
        deduplicate: options.deduplicate,
        errors: options.errors,
      });
      const records = options.errors === "collect" ? parsed.data : parsed;
      const errors = options.errors === "collect" ? parsed.errors : [];
      const output = structpaste.serialize(records, {
        ...options.outputOptions,
        format: options.output,
        schema: options.schema,
      });

      return {
        output,
        records,
        errors,
        metadata: {
          recordCount: records.length,
          errorCount: errors.length,
          format: options.output,
        },
      };
    } catch (error) {
      throw normalizeLibraryError(error);
    }
  }
}

module.exports = {
  ALLOWED_ERROR_MODES,
  ALLOWED_OUTPUTS,
  ALLOWED_PARSERS,
  ALLOWED_SCHEMA_TYPES,
  MAX_INPUT_SIZE,
  MAX_SCHEMA_FIELDS,
  TextToStructService,
  normalizeRequest,
};
