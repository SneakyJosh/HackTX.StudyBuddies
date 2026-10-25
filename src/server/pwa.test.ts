import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the install manifest names StudyBuddie and stays standalone", () => {
  const source = readFileSync("src/app/manifest.ts", "utf8");
  assert.match(source, /name: "StudyBuddie"/);
  assert.match(source, /short_name: "StudyBuddie"/);
  assert.match(source, /start_url: "\/"/);
  assert.match(source, /display: "standalone"/);
  assert.match(source, /theme_color: "#ff8a1f"/);
  assert.match(source, /192x192/);
  assert.match(source, /512x512/);
});

test("the service worker caches only static assets", () => {
  const source = readFileSync("public/sw.js", "utf8");
  assert.match(source, /\/_next\/static\//);
  assert.match(source, /\/icons\//);
  assert.equal(source.includes("/api/"), false);
  assert.equal(source.includes("supabase"), false);
  assert.equal(source.includes("set-cookie"), true);
  for (const file of ["public/icons/icon-192.png", "public/icons/icon-512.png", "public/icons/apple-touch-icon.png"]) {
    const png = readFileSync(file);
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", file);
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    assert.equal(width, height, file);
    assert.ok(width === 192 || width === 512 || width === 180, file);
  }
});
