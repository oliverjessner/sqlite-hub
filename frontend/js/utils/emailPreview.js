const EMAIL_PATTERN = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

export function detectEmailValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();

  if (!text || text.length > 320 || !EMAIL_PATTERN.test(text)) {
    return null;
  }

  const atIndex = text.lastIndexOf("@");
  const localPart = text.slice(0, atIndex);
  const domain = text.slice(atIndex + 1);

  if (!localPart || !domain || domain.startsWith(".") || domain.endsWith(".")) {
    return null;
  }

  return {
    type: "email",
    value: text,
    localPart,
    domain,
  };
}
