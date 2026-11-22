import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-device-id, x-device-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const respond = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers });
export function validateReading(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Expected an object");
  const data = input as Record<string, unknown>;
  function number(name: string, min: number, max: number, nullable = false, integer = false): number | null {
    const value = data[name];
    if (nullable && value === null) return null;
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max
        || (integer && !Number.isInteger(value))) throw new Error(`Invalid ${name}`);
    return value;
  }
  const temperature_c = number("temperature_c", -40, 80, true);
  const humidity_pct = number("humidity_pct", 0, 100, true);
  const illuminance_lux = number("illuminance_lux", 0, 200000, true);
  const full_spectrum = number("full_spectrum", 0, 65535, true, true);
  const infrared = number("infrared", 0, 65535, true, true);
  const wifi_rssi = number("wifi_rssi", -127, 0, true, true);
  const uptime_s = number("uptime_s", 0, 4294967295, false, true)!;
  const sample_age_ms = number("sample_age_ms", 0, 10000, false, true)!;
  const light_status = data.light_status;
  if (!["ok", "error", "saturated"].includes(light_status as string)) throw new Error("Invalid light_status");
  if (light_status === "ok" && (illuminance_lux === null || full_spectrum === null || infrared === null)) throw new Error("Valid light requires lux and raw channels");
  if (light_status !== "ok" && illuminance_lux !== null) throw new Error("Invalid light must use null lux");
  if (light_status === "error" && (full_spectrum !== null || infrared !== null)) throw new Error("Light read error must use null raw channels");
  if (light_status === "saturated" && (full_spectrum === null || infrared === null)) throw new Error("Saturation requires raw channels");
  // Identity and timestamps cannot be supplied/overridden by the JSON payload.
  return { temperature_c, humidity_pct, illuminance_lux, light_status, full_spectrum, infrared, wifi_rssi, uptime_s, sample_age_ms };
}
export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
function equalHash(left: string, right: string) {
  if (right.length !== 64) return false;
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}
async function readBody(request: Request) {
  if (!request.body) throw new Error("Missing body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 4096) { await reader.cancel(); throw new Error("Body too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function createEnvironmentHandler(getClient: () => SupabaseClient) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response("ok", { headers });
    if (request.method !== "POST") return respond({ ok: false, error: "POST required" }, 405);
    const deviceCode = request.headers.get("x-device-id")?.trim().toLowerCase() || "";
    const secret = request.headers.get("x-device-secret")?.trim() || "";
    if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(deviceCode) || !secret || secret.length > 512) return respond({ ok: false, error: "Device authentication required" }, 401);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return respond({ ok: false, error: "application/json required" }, 415);
    try {
      const client = getClient();
      const { data: device, error } = await client.from("presence_devices")
        .select("id, device_code, display_name, secret_hash, enabled").eq("device_code", deviceCode).maybeSingle();
      if (error) throw new Error(`Device lookup failed (${error.code})`);
      const hash = await sha256Hex(secret);
      if (!device || !device.enabled || !equalHash(hash, device.secret_hash)) return respond({ ok: false, error: "Device authentication failed" }, 401);
      let reading;
      try { reading = validateReading(await readBody(request)); }
      catch (error) { return respond({ ok: false, error: error instanceof Error ? error.message : "Invalid body" }, 400); }
      const { sample_age_ms, ...values } = reading;
      const now = Date.now();
      const received_at = new Date(now).toISOString();
      const { error: writeError } = await client.from("environment_latest").upsert({
        ...values, device_id: device.id, device_code: device.device_code, display_name: device.display_name,
        sampled_at: new Date(now - sample_age_ms).toISOString(), received_at,
      }, { onConflict: "device_id" });
      if (writeError) throw new Error(`Environment write failed (${writeError.code})`);
      return respond({ ok: true, received_at, next_upload_seconds: 60 });
    } catch (error) {
      console.error("ingest-environment failed", error instanceof Error ? error.message : "unknown error");
      return respond({ ok: false, error: "Environment service unavailable" }, 500);
    }
  };
}
