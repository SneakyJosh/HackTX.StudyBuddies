import { createHash } from "node:crypto";

const DEMO_NAMESPACE = "c0ffee00-1111-4111-8111-000000000001";

export function uuidV5(name, namespace) {
  const ns = Buffer.from(namespace.replaceAll("-", ""), "hex");
  if (ns.length !== 16) throw new Error("namespace must be a UUID");
  const hash = createHash("sha1").update(ns).update(name, "utf8").digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function demoId(name) {
  return uuidV5(name, DEMO_NAMESPACE);
}
