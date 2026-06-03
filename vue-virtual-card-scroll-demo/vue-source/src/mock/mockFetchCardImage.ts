import type { MockCard, MockCardImageRequest, MockCardImageResult } from "../types";

const palette = [
  ["#0f766e", "#7dd3fc"],
  ["#6656d9", "#f0abfc"],
  ["#b7791f", "#fde68a"],
  ["#2563eb", "#86efac"],
  ["#be123c", "#fdba74"],
  ["#475569", "#c4b5fd"]
];

function makeAbortError(): Error {
  try {
    return new DOMException("Mock image request aborted", "AbortError");
  } catch {
    const error = new Error("Mock image request aborted");
    error.name = "AbortError";
    return error;
  }
}

function escapeSvgText(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function colorsFor(cardId: number): string[] {
  return palette[cardId % palette.length];
}

function buildCardImage(card: MockCard, mode: "preview" | "full"): string {
  const [start, end] = colorsFor(card.id);
  const label = escapeSvgText(`#${card.id}`);
  const title = escapeSvgText(card.title);
  const tag = escapeSvgText(card.tag);
  const opacity = mode === "preview" ? 0.58 : 1;
  const textureOpacity = mode === "preview" ? 0.14 : 0.24;

  return svgToDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" role="img" aria-label="${title}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${start}"/>
          <stop offset="100%" stop-color="${end}"/>
        </linearGradient>
        <pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="2" fill="#ffffff" opacity="${textureOpacity}"/>
        </pattern>
      </defs>
      <rect width="320" height="180" rx="18" fill="url(#g)" opacity="${opacity}"/>
      <rect width="320" height="180" rx="18" fill="url(#dots)"/>
      <circle cx="258" cy="34" r="58" fill="#ffffff" opacity="0.16"/>
      <circle cx="32" cy="160" r="72" fill="#172033" opacity="0.14"/>
      <text x="24" y="46" fill="#ffffff" font-family="Arial, sans-serif" font-size="26" font-weight="700">${label}</text>
      <text x="24" y="82" fill="#ffffff" font-family="Arial, sans-serif" font-size="18" font-weight="700">${tag}</text>
      <text x="24" y="132" fill="#ffffff" font-family="Arial, sans-serif" font-size="20" font-weight="700">${title}</text>
    </svg>
  `);
}

export function buildMockCardImagePreview(card: MockCard): string {
  return buildCardImage(card, "preview");
}

export function mockFetchCardImage(params: MockCardImageRequest): Promise<MockCardImageResult> {
  const { card, signal } = params;
  const delay = 180 + Math.floor(Math.random() * 360);

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(makeAbortError());
      return;
    }

    const timer = window.setTimeout(() => {
      if (signal?.aborted) {
        reject(makeAbortError());
        return;
      }

      resolve({
        cardId: card.id,
        delay,
        src: buildCardImage(card, "full"),
        previewSrc: buildCardImage(card, "preview")
      });
    }, delay);

    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(makeAbortError());
      },
      { once: true }
    );
  });
}
