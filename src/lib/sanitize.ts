import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitize untrusted HTML before rendering with dangerouslySetInnerHTML.
 *
 * Built on DOMPurify (Cure53), the de-facto standard with regular third-party
 * security audits. Strips <script>, <iframe>, event handlers (onclick, onerror...),
 * javascript: URLs, and other XSS vectors.
 *
 * Email-specific config:
 * - Allow style attributes (emails rely on inline CSS)
 * - Allow images with data: URIs (common in email tracking pixels, harmless)
 * - Block forms (rare in emails, common in phishing)
 * - Block iframes (bypass CSP, load trackers)
 *
 * Usage:
 *   <div dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(body) }} />
 */
export function sanitizeEmailHtml(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "base", "meta"],
    FORBID_ATTR: [
      "onerror",
      "onload",
      "onclick",
      "onmouseover",
      "onfocus",
      "onblur",
      "onchange",
      "onsubmit",
      "formaction",
      "srcdoc",
    ],
    ALLOW_DATA_ATTR: false,
    // Sanitize URIs — DOMPurify blocks javascript:, data: (except images), vbscript:
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|cid|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
  });
}

/**
 * Sanitize plain text content — strips ALL HTML tags.
 * Use for user-generated text that must not contain any markup (e.g. chat inputs,
 * form text fields rendered into dangerouslySetInnerHTML).
 */
export function sanitizeText(text: string): string {
  if (!text) return "";
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
