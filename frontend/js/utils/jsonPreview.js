export function formatJsonPreview(value) {
  if (value === null || value === undefined) {
    return null;
  }

  let parsed = value;

  if (typeof value !== "object") {
    const text = String(value).trim();

    if (!text || !["{", "["].includes(text[0])) {
      return null;
    }

    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  try {
    return JSON.stringify(parsed, null, 2);
  } catch (error) {
    return null;
  }
}
