import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://death-momoi.github.io",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function requiredEnv(name) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`缺少 Edge Function Secret：${name}`);
  return value;
}

function readNamedSupabaseKey(name, legacyName) {
  const rawValue = Deno.env.get(name);

  if (rawValue) {
    const parsed = JSON.parse(rawValue);
    if (typeof parsed.default === "string" && parsed.default) {
      return parsed.default;
    }
  }

  return requiredEnv(legacyName);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanHeader(value) {
  return String(value).replace(/[\r\n]/g, "").trim();
}

function assertEmail(value, secretName) {
  const email = cleanHeader(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`${secretName} 不是有效的 Email`);
  }
  return email;
}

function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }

  return btoa(binary);
}

function utf8ToBase64Url(value) {
  return utf8ToBase64(value)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function formatTaipeiTime(value) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function buildRawEmail({ sender, recipient, subject, html }) {
  const encodedSubject = `=?UTF-8?B?${utf8ToBase64(subject)}?=`;
  const encodedBody = utf8ToBase64(html);

  const mimeMessage = [
    `From: ${cleanHeader(sender)}`,
    `To: ${cleanHeader(recipient)}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodedBody,
  ].join("\r\n");

  return utf8ToBase64Url(mimeMessage);
}

async function getGoogleAccessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: requiredEnv("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
      refresh_token: requiredEnv("GOOGLE_OAUTH_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });

  const payload = await response.json();

  if (!response.ok || typeof payload.access_token !== "string") {
    throw new Error(
      payload.error_description || payload.error || "無法取得 Google access token",
    );
  }

  return payload.access_token;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "只接受 POST 請求" }, 405);
  }

  const authorization = request.headers.get("Authorization") || "";
  const jwt = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!jwt) {
    return jsonResponse({ error: "請先登入" }, 401);
  }

  let requestBody;
  try {
    requestBody = await request.json();
  } catch {
    return jsonResponse({ error: "請求內容不是有效的 JSON" }, 400);
  }

  const reportId = typeof requestBody?.report_id === "string"
    ? requestBody.report_id
    : "";

  if (!isUuid(reportId)) {
    return jsonResponse({ error: "無效的問題回報 ID" }, 400);
  }

  let supabaseAdmin = null;
  let ownedReport = false;

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const publishableKey = readNamedSupabaseKey(
      "SUPABASE_PUBLISHABLE_KEYS",
      "SUPABASE_ANON_KEY",
    );
    const secretKey = readNamedSupabaseKey(
      "SUPABASE_SECRET_KEYS",
      "SUPABASE_SERVICE_ROLE_KEY",
    );

    const supabaseAuth = createClient(supabaseUrl, publishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser(jwt);

    if (userError || !user) {
      return jsonResponse({ error: "登入狀態無效，請重新登入" }, 401);
    }

    supabaseAdmin = createClient(supabaseUrl, secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    const { data: report, error: reportError } = await supabaseAdmin
      .from("issue_reports")
      .select("id, reporter_id, description, created_at, notification_status")
      .eq("id", reportId)
      .maybeSingle();

    if (reportError) throw reportError;
    if (!report) return jsonResponse({ error: "找不到問題回報" }, 404);

    if (report.reporter_id !== user.id) {
      return jsonResponse({ error: "無權寄送這筆問題回報" }, 403);
    }

    ownedReport = true;

    if (report.notification_status === "sent") {
      return jsonResponse({ ok: true, already_sent: true });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    if (profileError) throw profileError;

    const sender = assertEmail(
      requiredEnv("GMAIL_SENDER_EMAIL"),
      "GMAIL_SENDER_EMAIL",
    );
    const recipient = assertEmail(
      requiredEnv("ISSUE_NOTIFICATION_TO"),
      "ISSUE_NOTIFICATION_TO",
    );

    const reporterName = profile.display_name || "未命名使用者";
    const reporterEmail = user.email || "未提供 Email";
    const subject = `[運科二簽到系統] 新問題回報：${reporterName}`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.7;color:#111827">
        <h2 style="color:#b91c1c">運動科學實驗室問題回報</h2>
        <p><strong>回報人：</strong>${escapeHtml(reporterName)}</p>
        <p><strong>Google 帳號：</strong>${escapeHtml(reporterEmail)}</p>
        <p><strong>回報時間：</strong>${escapeHtml(formatTaipeiTime(report.created_at))}</p>
        <p><strong>問題內容：</strong></p>
        <div style="padding:12px;background:#f3f4f6;border-left:4px solid #dc2626;white-space:pre-wrap">${escapeHtml(report.description)}</div>
        <p style="margin-top:20px;color:#6b7280;font-size:12px">本信件由運科二簽到系統自動發送。</p>
      </div>
    `.trim();

    const accessToken = await getGoogleAccessToken();
    const raw = buildRawEmail({ sender, recipient, subject, html });

    const gmailResponse = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      },
    );

    const gmailBody = await gmailResponse.text();

    if (!gmailResponse.ok) {
      throw new Error(`Gmail API 寄送失敗：${gmailBody.slice(0, 300)}`);
    }

    const { error: updateError } = await supabaseAdmin
      .from("issue_reports")
      .update({
        notification_status: "sent",
        notified_at: new Date().toISOString(),
        notification_error: null,
      })
      .eq("id", reportId);

    if (updateError) {
      console.error("Gmail 已寄出，但更新通知狀態失敗", updateError);
      return jsonResponse({
        ok: true,
        email_sent: true,
        status_recorded: false,
      });
    }

    return jsonResponse({
      ok: true,
      email_sent: true,
      status_recorded: true,
    });
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : "未知的 Gmail 通知錯誤";

    console.error("send-issue-email failed", error);

    if (supabaseAdmin && ownedReport) {
      const { error: statusError } = await supabaseAdmin
        .from("issue_reports")
        .update({
          notification_status: "failed",
          notified_at: null,
          notification_error: errorMessage.slice(0, 500),
        })
        .eq("id", reportId);

      if (statusError) {
        console.error("更新 Gmail 失敗狀態時發生錯誤", statusError);
      }
    }

    return jsonResponse({ error: "Gmail 通知寄送失敗" }, 500);
  }
});
