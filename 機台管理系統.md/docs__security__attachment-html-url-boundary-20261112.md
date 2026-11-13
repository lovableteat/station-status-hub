> 集中副本；原始路徑：`docs/security/attachment-html-url-boundary-20261112.md`；程式參考基準：`2c5dd8829effc42acd60f64089701abb57e481c2`。歷史文件保留當時語意，先以 00_閱讀指南.md 與現行手冊判定適用範圍。

# Attachment HTML display boundary (isolated candidate)

This is a render-only follow-up. It does not rewrite saved HTML, change a bucket,
read real attachments, revoke existing links server-side, deploy a client or prove
that an already-open old tab is safe. Existing table/paragraph/text and ordinary
inline font/color/border styles remain. Source strings and persisted editor nodes
are unchanged; only the display DOM gets short-lived authorized URLs.

## Source inventory and handling

Reviewed the installed, locked DOMPurify 3.4.17 HTML/SVG/MathML/XML allowlists,
including `src`, `srcset`, `poster`, `background`, `action`, `cite`, `href`,
`xlink:href`, `usemap`, SVG `glyphref`, inline style, style elements and SVG paint
attributes. DOMPurify blocks `use`, general `animate`/`set`, object/iframe and many
other transports by default; this patch does not broaden any allowlist.

- Scalar URL attributes are handled independently of tag name. This includes
  input images, audio/video/source, SVG image/links and MathML links.
- `srcset` parses URL tokens separately from descriptors: commas inside URLs/data
  URLs are not separators. Valid density/width and width-height descriptors are
  preserved; malformed/duplicate/nonfinite descriptors are dropped as candidates.
  A private candidate is removed before signing, and cannot become unsigned
  fallback when another candidate succeeds. External candidates remain external.
- Only the configured project's issue/task attachment routes are re-signed. Object
  public/sign/authenticated routes, protocol-relative URLs and image-transform
  routes are recognized. Malformed private-looking paths are removed rather than
  passed through. Same-host wrong scheme/port, trailing-dot host aliases and
  encoded private routing are classified for rejection, never for broader signing.
  Image-transform references display the original authorized
  object; their old resize/quality query options are not copied to the signature.
- Signing is deduplicated per object/render. Denial never restores a public link.
  Unexpected non-HTTP(S) signer output is rejected before inserting any attribute.
- Auth changes immediately schedule removal of prior-session URLs. Generation,
  unmount and content checks reject late responses. Timers do not restore signed
  content after sign-out. Original title/aria-disabled state returns on success.

## Explicit display differences

CSS is not an attachment transport. Style elements are removed from the display;
inline style and paint attributes containing URL/image/variable expressions,
comments or escapes are conservatively omitted. This can hide background images,
remote fonts/paints, and styling supplied only through a stylesheet or escaped CSS.
Simple local SVG `url(#id)` paint references remain. Ordinary inline colors/fonts,
cell borders and text remain. These display restrictions do **not** delete or
rewrite source styles, attachments or records.

DOMPurify already rejects `srcset` attributes containing `data:` URLs in this
configuration. That existing sanitizer behavior is deliberately retained, not
weakened to make a parser test pass. The parser itself handles comma data URLs
correctly. Other legal external URLs are preserved; that is compatibility, not a
claim of arbitrary-network isolation or authorization of external content.

## Verification and remaining browser gate

`tests/privateAttachmentHtmlUrls.test.mjs` uses real DOMPurify/jsdom and the actual
component with synthetic Storage/Auth. The previous attachment/editor persistence
suite is retained. No actual stored HTML or account data is used.

`tests/attachmentHtmlUrls.browser.cjs` bundles the real component with an isolated
client. Its route observer is installed before navigation and sanitization, records
and aborts every non-loopback request, and fails on *attempted* private-origin
requests. It checks deferred signing, old-session resolution after logout, new
session signing, denial, unchanged source text, retained table/formatting, and
screenshots at desktop and phone widths. `AUDIT_BUILD_ONLY=1` compiles without
importing or launching Playwright. Non-build execution asserts both GITHUB_ACTIONS
  and the pull_request event before importing Playwright. Reports/screenshots are
  saved for failure as well as success; Storage/database/local/session/IndexedDB
  persistence spies and network-method records are measured, not hard-coded zeros.
  Actual Chromium execution is reserved for the
authorized isolated PR CI; a successful bundle/jsdom test is not browser proof.

DOMPurify's RETURN_DOM avoids a second DOMParser pass. Its inert-document behavior
still requires the real-browser network-attempt assertion above. Do not publish
old unsafe chunks or claim complete URL isolation before that gate passes. This
candidate does not cover already cached blob/data payloads, server-side access
control, other project origins/buckets, old clients, or full backup restoration.

## Local candidate result (not remote browser acceptance)

- Existing attachment/editor suite plus new URL contracts: 36/36.
- Full unit/source suite: 2,508 total, 2,500 pass, 8 pre-existing skips, 0 failures.
- Typecheck passes; lint has 0 errors and 74 existing warnings.
- Synthetic-endpoint application build passes; browser harness build-only
  passes. No local Chromium launch, commit, push or deployment was performed.

The classification decoder is bounded; excessively nested same-host encoding is
blocked as ambiguous rather than signed. CSS filtering is intentionally
conservative, including URL-like text/comments/escapes even where a browser might
not ultimately fetch anything. Such styling may be hidden only in the display.
External links and redirects are not a substitute for server-side private-bucket
controls. Previously issued signed URLs remain subject to server expiry, not
retroactive revocation by this client patch.


### WHATWG normalization boundary follow-up

Classification resolves against the configured HTTPS project base using WHATWG
URL parsing, which recognizes double-backslash and mixed slash/backslash network
paths and embedded tab, CR or LF normalization. Same-project private aliases are
removed from scalar and srcset display rather than treated as external. Signing
is not widened: raw backslashes, C0/control characters (not ordinary path spaces), and
relative spellings cannot receive a signed URL through this helper. This conservatively hides relative private routes. Scalar literal-space
filenames retain the same strict signing path as their percent-encoded equivalents;
srcset continues to follow its separate whitespace token rules. Other-host references are still external, not silently signed.
The source HTML is unchanged. Real-browser CI includes network-path variants and
embedded-tab host spelling before sanitization, with interception installed before
navigation and assertions for both zero private-origin attempts and no remaining
alias src/srcset attributes. Browser execution remains pending; local validation
is Node/jsdom and build-only, not evidence of browser inert-parser behavior.

## Isolated PR integration gate

The regression workflow executes the actual-browser runner only for pull requests,
with a 120-second process bound and an independent failure status. It collects
`attachment-html-urls/results.json` and screenshots even on failure. Source tests
protect that wiring, CI-only launch checks and observed persistence/network
assertions. This added gate does not deploy or read production content. Local
build-only results are not acceptance of the new Chromium network contract.
