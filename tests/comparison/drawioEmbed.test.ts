import assert from "node:assert/strict";
import test from "node:test";
import { DRAWIO_ORIGIN, drawioEditorUrl, readDrawioMessage } from "../../src/components/comparison/drawioEmbed.ts";
import { MAX_DRAWIO_BYTES } from "../../src/components/comparison/drawioDocument.ts";

const frame = {} as Window;
const message = (value: unknown, origin = DRAWIO_ORIGIN, source: MessageEventSource | null = frame) => ({ origin, source, data: typeof value === "string" ? value : JSON.stringify(value) });

test("official DRAWIO URLs enable the full library and JSON embed protocol without plugins or cloud drafts", () => {
  for (const dark of [true, false]) {
    const url = new URL(drawioEditorUrl(dark));
    assert.equal(url.origin, DRAWIO_ORIGIN);
    assert.equal(url.protocol, "https:");
    assert.equal(url.searchParams.get("embed"), "1");
    assert.equal(url.searchParams.get("proto"), "json");
    assert.equal(url.searchParams.get("configure"), "1");
    assert.equal(url.searchParams.get("libraries"), "1");
    assert.equal(url.searchParams.get("lang"), "zh-tw");
    assert.equal(url.searchParams.get("ui"), dark ? "dark" : "kennedy");
    assert.equal(url.searchParams.get("local"), "1");
    assert.equal(url.searchParams.get("drafts"), "0");
    assert.equal(url.searchParams.get("plugins"), "0");
    assert.equal(url.searchParams.get("stealth"), "1");
    assert.match(url.searchParams.get("libs") ?? "", /electrical/);
  }
});

test("only JSON messages from the exact official origin and active iframe window are accepted", () => {
  const xml = '<mxfile><diagram id="one">exact compressed payload</diagram></mxfile>';
  const payload = { event: "autosave", xml };
  assert.deepEqual(readDrawioMessage(message(payload), frame), payload);
  for (const origin of ["https://evil.test", `${DRAWIO_ORIGIN}.evil.test`, "http://embed.diagrams.net", "null", "https://app.diagrams.net"]) assert.equal(readDrawioMessage(message(payload, origin), frame), null);
  assert.equal(readDrawioMessage(message(payload, DRAWIO_ORIGIN, {} as Window), frame), null);
  assert.equal(readDrawioMessage(message(payload), null), null);
  assert.equal(readDrawioMessage({ origin: DRAWIO_ORIGIN, source: frame, data: payload }, frame), null);
});

test("unsupported, malformed and oversized embed envelopes fail closed without altering native XML", () => {
  for (const payload of ["{", "null", "[]", JSON.stringify({ event: "exit" }), JSON.stringify({ action: "load" }), JSON.stringify({ event: "autosave", xml: {} }), JSON.stringify({ event: "autosave", xml: "x".repeat(MAX_DRAWIO_BYTES + 1) }), "x".repeat(MAX_DRAWIO_BYTES * 2 + 16385)]) assert.equal(readDrawioMessage(message(payload), frame), null);
  for (const event of ["configure", "init", "load", "autosave", "save", "export"] as const) assert.equal(readDrawioMessage(message({ event }), frame)?.event, event);
  const xml = "\uFEFF<mxfile>\n<diagram>compressed+/==</diagram>\n</mxfile>\n";
  const payload = { event: "export", format: "xml", xml, message: { requestId: "requested" } };
  assert.deepEqual(readDrawioMessage(message(payload), frame), payload);
});
