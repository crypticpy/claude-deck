/**
 * SVG utility functions for safe dynamic content rendering
 */

/**
 * Escape a string for safe interpolation into SVG/XML text content.
 * Handles the 5 XML predefined entities.
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Convert an SVG string to a base64-encoded data URI suitable for Stream Deck setImage().
 * Using base64 instead of encodeURIComponent avoids URL-encoding edge cases with
 * special characters and SMIL animations.
 */
export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * Wrap SVG content in the standard 144x144 Stream Deck canvas with dark background.
 */
export function svgWrap(content: string, bgColor = "#0f172a"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="${bgColor}" rx="12"/>
  ${content}
</svg>`;
}
