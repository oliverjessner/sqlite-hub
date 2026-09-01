const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { NotFoundError, ValidationError } = require("../utils/errors");
const { resolvePathInsideDirectory } = require("../utils/fileValidation");

const MAX_CHART_IMAGE_SIZE_BYTES = 7 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DATABASE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function normalizeDatabaseId(value) {
  const databaseId = String(value ?? "").trim();

  if (!DATABASE_ID_PATTERN.test(databaseId)) {
    throw new ValidationError("Database id contains unsupported characters.");
  }

  return databaseId;
}

function normalizeChartId(value) {
  const chartId = Number(value);

  if (!Number.isSafeInteger(chartId) || chartId <= 0) {
    throw new ValidationError("Chart id must be a positive integer.");
  }

  return chartId;
}

function decodePngDataUrl(value) {
  const match = String(value ?? "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);

  if (!match) {
    throw new ValidationError("Chart image must be a base64-encoded PNG data URL.");
  }

  const buffer = Buffer.from(match[1], "base64");

  if (!buffer.length || buffer.length > MAX_CHART_IMAGE_SIZE_BYTES) {
    throw new ValidationError(
      `Chart PNG must be between 1 byte and ${MAX_CHART_IMAGE_SIZE_BYTES} bytes.`
    );
  }

  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new ValidationError("Chart image does not contain a valid PNG signature.");
  }

  return buffer;
}

class ChartImageService {
  constructor(publicRoot) {
    const normalizedRoot = String(publicRoot ?? "").trim();

    if (!normalizedRoot) {
      throw new ValidationError("Chart public root is required.");
    }

    this.publicRoot = path.resolve(normalizedRoot);
  }

  getChartDirectory(databaseId) {
    return resolvePathInsideDirectory(
      this.publicRoot,
      path.join(normalizeDatabaseId(databaseId), "charts"),
      "Chart image directory"
    );
  }

  getChartImagePath(databaseId, chartId) {
    return resolvePathInsideDirectory(
      this.getChartDirectory(databaseId),
      `${normalizeChartId(chartId)}.png`,
      "Chart image path"
    );
  }

  getChartImageUrl(databaseId, chartId) {
    return `/${encodeURIComponent(normalizeDatabaseId(databaseId))}/chart/${normalizeChartId(chartId)}.png`;
  }

  saveChartImage(databaseId, chartId, pngDataUrl) {
    const imagePath = this.getChartImagePath(databaseId, chartId);
    const imageBuffer = decodePngDataUrl(pngDataUrl);
    const directory = path.dirname(imagePath);

    fs.mkdirSync(directory, { recursive: true });

    if (fs.existsSync(imagePath) && fs.readFileSync(imagePath).equals(imageBuffer)) {
      return {
        path: imagePath,
        url: this.getChartImageUrl(databaseId, chartId),
        sizeBytes: imageBuffer.length,
        updated: false,
      };
    }

    const temporaryPath = resolvePathInsideDirectory(
      directory,
      `.${normalizeChartId(chartId)}-${process.pid}-${crypto.randomUUID()}.tmp`,
      "Temporary chart image path"
    );

    try {
      fs.writeFileSync(temporaryPath, imageBuffer, { flag: "wx" });
      fs.renameSync(temporaryPath, imagePath);
    } finally {
      if (fs.existsSync(temporaryPath)) {
        fs.unlinkSync(temporaryPath);
      }
    }

    return {
      path: imagePath,
      url: this.getChartImageUrl(databaseId, chartId),
      sizeBytes: imageBuffer.length,
      updated: true,
    };
  }

  requireChartImage(databaseId, chartId) {
    const imagePath = this.getChartImagePath(databaseId, chartId);

    if (!fs.existsSync(imagePath) || !fs.statSync(imagePath).isFile()) {
      throw new NotFoundError(`Published chart image not found: ${chartId}`);
    }

    return imagePath;
  }

  deleteChartImage(databaseId, chartId) {
    const imagePath = this.getChartImagePath(databaseId, chartId);

    if (!fs.existsSync(imagePath)) {
      return false;
    }

    fs.unlinkSync(imagePath);
    return true;
  }
}

module.exports = {
  ChartImageService,
  MAX_CHART_IMAGE_SIZE_BYTES,
  decodePngDataUrl,
  normalizeChartId,
  normalizeDatabaseId,
};
