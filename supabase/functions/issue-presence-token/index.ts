import { createClient } from "npm:@supabase/supabase-js@2";

const TOKEN_TTL_SECONDS = 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "content-type, x-device-id, x-device-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`缺少 Edge Function Secret：${name}`);
  return value;
}

function readNamedSupabaseKey(name: string, legacyName: string) {
  const rawValue = Deno.env.get(name)?.trim();

  if (rawValue) {
    try {
      const parsed = JSON.parse(rawValue);
      if (typeof parsed.default === "string" && parsed.default) {
        return parsed.default;
      }
    } catch {
      // Some projects expose one key directly instead of a named-key object.
      return rawValue;
    }
  }

  return requiredEnv(legacyName);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

function constantTimeEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return difference === 0;
}

function checkInUrl(rawBaseUrl: string, token: string) {
  const url = new URL(rawBaseUrl);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("CHECKIN_APP_URL 必須使用 HTTPS");
  }
  url.searchParams.set("presence_token", token);
  return url.toString();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "只接受 POST 請求" }, 405);
  }

  try {
    const deviceCode = request.headers.get("x-device-id")?.trim().toLowerCase();
    const deviceSecret = request.headers.get("x-device-secret")?.trim();

    if (!deviceCode || !deviceSecret) {
      return jsonResponse({ ok: false, error: "缺少裝置認證資料" }, 401);
    }

    if (!/^[a-z0-9][a-z0-9_-]{2,63}$/u.test(deviceCode)) {
      return jsonResponse({ ok: false, error: "裝置代碼格式錯誤" }, 401);
    }

    const supabase = createClient(
      requiredEnv("SUPABASE_URL"),
      readNamedSupabaseKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: device, error: deviceError } = await supabase
      .from("presence_devices")
      .select("id, secret_hash, enabled")
      .eq("device_code", deviceCode)
      .maybeSingle();

    if (deviceError) {
      console.error("presence device lookup failed", {
        code: deviceError.code,
        message: deviceError.message,
        details: deviceError.details,
      });
      return jsonResponse({ ok: false, error: "無法讀取現場裝置資料" }, 500);
    }

    const suppliedSecretHash = await sha256Hex(deviceSecret);
    if (
      !device ||
      !device.enabled ||
      !constantTimeEqual(suppliedSecretHash, device.secret_hash)
    ) {
      return jsonResponse({ ok: false, error: "裝置認證失敗" }, 401);
    }

    const randomBytes = crypto.getRandomValues(new Uint8Array(18));
    const token = bytesToBase64Url(randomBytes);
    const tokenHash = await sha256Hex(token);
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + TOKEN_TTL_SECONDS * 1000);

    const { error: insertError } = await supabase
      .from("presence_qr_tokens")
      .insert({
        token_hash: tokenHash,
        device_id: device.id,
        issued_at: issuedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) throw insertError;

    await supabase
      .from("presence_devices")
      .update({ last_seen_at: issuedAt.toISOString() })
      .eq("id", device.id);

    // Old hashes have no value after expiry. Keep one day for brief diagnostics.
    await supabase
      .from("presence_qr_tokens")
      .delete()
      .lt("expires_at", new Date(issuedAt.getTime() - 86_400_000).toISOString());

    return jsonResponse({
      ok: true,
      token,
      check_in_url: checkInUrl(requiredEnv("CHECKIN_APP_URL"), token),
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      expires_in: TOKEN_TTL_SECONDS,
    });
  } catch (error) {
    console.error("issue-presence-token failed", error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : "無法產生現場 QR Code",
    }, 500);
  }
});
