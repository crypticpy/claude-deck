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
