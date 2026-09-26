import { createClient } from "@supabase/supabase-js";

const TAIPEI_TIME_ZONE = "Asia/Taipei";

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
      "Cache-Control": "no-store",
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
    try {
      const parsed = JSON.parse(rawValue);
      if (typeof parsed.default === "string" && parsed.default) {
        return parsed.default;
      }
    } catch {
      // 新版 Supabase 專案可能直接提供單一字串，交由舊名稱後援處理。
    }
  }

  return requiredEnv(legacyName);
}

function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }

  return { value, year, month, day };
}

function parseMonth(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month] = value.split("-").map(Number);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) {
    return null;
  }
  return { value, year, month };
}

function nextDateString({ year, month, day }) {
  return new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
}

function nextMonthString({ year, month }) {
  return new Date(Date.UTC(year, month, 1))
    .toISOString()
    .slice(0, 7);
}

function minuteLabel(minutes) {
  if (minutes >= 1440) return "24:00";

  const safeMinutes = Math.max(0, Math.min(1439, minutes));
  const hour = Math.floor(safeMinutes / 60);
  const minute = safeMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function eventToPublicRecord(event, dayStartMs, dayEndMs) {
  const isAllDay = typeof event?.start?.date === "string";
  const startValue = isAllDay ? event?.start?.date : event?.start?.dateTime;
  const endValue = isAllDay ? event?.end?.date : event?.end?.dateTime;

  if (typeof startValue !== "string" || typeof endValue !== "string") {
    return null;
  }

  const startMs = Date.parse(
    isAllDay ? `${startValue}T00:00:00+08:00` : startValue,
  );
  const endMs = Date.parse(
    isAllDay ? `${endValue}T00:00:00+08:00` : endValue,
  );

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }

  const visibleStartMs = Math.max(startMs, dayStartMs);
  const visibleEndMs = Math.min(endMs, dayEndMs);

  if (visibleEndMs <= visibleStartMs) return null;

  const startMinute = Math.max(
    0,
    Math.min(1440, Math.floor((visibleStartMs - dayStartMs) / 60000)),
  );
  const endMinute = Math.max(
    0,
    Math.min(1440, Math.ceil((visibleEndMs - dayStartMs) / 60000)),
  );

  const rawTitle = typeof event.summary === "string" ? event.summary.trim() : "";

  return {
    id: typeof event.id === "string" ? event.id : null,
    title: (rawTitle || "未命名預約").slice(0, 200),
    all_day: isAllDay,
    start: startValue,
    end: endValue,
    start_minute: startMinute,
    end_minute: endMinute,
    start_label: minuteLabel(startMinute),
    end_label: minuteLabel(endMinute),
  };
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
      refresh_token: requiredEnv("GOOGLE_CALENDAR_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });

  const payload = await response.json();

  if (!response.ok || typeof payload.access_token !== "string") {
    throw new Error(
      payload.error_description ||
        payload.error ||
        "無法取得 Google Calendar access token",
    );
  }

  return payload.access_token;
}

async function getGoogleCalendarEvents(timeMin, timeMax, accessToken) {
  const calendarId = requiredEnv("GOOGLE_CALENDAR_ID");
  const allEvents = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      showDeleted: "false",
      timeZone: TAIPEI_TIME_ZONE,
      maxResults: "250",
      eventTypes: "default",
      fields: "items(id,summary,status,start,end),nextPageToken",
    });

    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Accept": "application/json",
        },
      },
    );

    if (!response.ok) {
      console.error("Google Calendar API error", response.status);

      if (response.status === 401 || response.status === 403) {
        throw new Error("Google Calendar 授權無效或沒有該日曆的讀取權限");
      }

      if (response.status === 404) {
        throw new Error("找不到指定的 Google Calendar，請檢查 Calendar ID");
      }

      throw new Error("Google Calendar API 暫時無法使用");
    }

    const payload = await response.json();
    if (Array.isArray(payload.items)) allEvents.push(...payload.items);
    pageToken = typeof payload.nextPageToken === "string"
      ? payload.nextPageToken
      : "";
  } while (pageToken);

  return allEvents
    .filter((event) => event?.status !== "cancelled");
}

async function getCalendarEvents(date, accessToken) {
  const nextDate = nextDateString(date);
  const timeMin = `${date.value}T00:00:00+08:00`;
  const timeMax = `${nextDate}T00:00:00+08:00`;
  const dayStartMs = Date.parse(timeMin);
  const dayEndMs = Date.parse(timeMax);
  const events = await getGoogleCalendarEvents(timeMin, timeMax, accessToken);

  return events
    .map((event) => eventToPublicRecord(event, dayStartMs, dayEndMs))
    .filter(Boolean)
    .sort((left, right) =>
      left.start_minute - right.start_minute ||
      left.end_minute - right.end_minute ||
      left.title.localeCompare(right.title, "zh-Hant")
    );
}

function eventTimeBounds(event) {
  const isAllDay = typeof event?.start?.date === "string";
  const startValue = isAllDay ? event?.start?.date : event?.start?.dateTime;
  const endValue = isAllDay ? event?.end?.date : event?.end?.dateTime;
  if (typeof startValue !== "string" || typeof endValue !== "string") {
    return null;
  }

  const startMs = Date.parse(
    isAllDay ? `${startValue}T00:00:00+08:00` : startValue,
  );
  const endMs = Date.parse(
    isAllDay ? `${endValue}T00:00:00+08:00` : endValue,
  );
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }
  return { startMs, endMs };
}

async function getCalendarActiveDates(month, accessToken) {
  const nextMonth = nextMonthString(month);
  const timeMin = `${month.value}-01T00:00:00+08:00`;
  const timeMax = `${nextMonth}-01T00:00:00+08:00`;
  const events = await getGoogleCalendarEvents(timeMin, timeMax, accessToken);
  const eventBounds = events.map(eventTimeBounds).filter(Boolean);
  const activeDates = [];
  const daysInMonth = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateValue = [
      String(month.year).padStart(4, "0"),
      String(month.month).padStart(2, "0"),
      String(day).padStart(2, "0"),
    ].join("-");
    const dayStartMs = Date.parse(`${dateValue}T00:00:00+08:00`);
    const dayEndMs = dayStartMs + 86_400_000;
    const hasEvent = eventBounds.some((bounds) =>
      bounds.startMs < dayEndMs && bounds.endMs > dayStartMs
    );
    if (hasEvent) activeDates.push(dateValue);
  }

  return activeDates;
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

  if (!jwt) return jsonResponse({ error: "請先登入" }, 401);

  let requestBody;
  try {
    requestBody = await request.json();
  } catch {
    return jsonResponse({ error: "請求內容不是有效的 JSON" }, 400);
  }

  const mode = requestBody?.mode === "active_dates"
    ? "active_dates"
    : "events";
  const date = mode === "events" ? parseDate(requestBody?.date) : null;
  const month = mode === "active_dates" ? parseMonth(requestBody?.month) : null;
  if (mode === "events" && !date) {
    return jsonResponse({ error: "日期格式必須是 YYYY-MM-DD" }, 400);
  }
  if (mode === "active_dates" && !month) {
    return jsonResponse({ error: "月份格式必須是 YYYY-MM" }, 400);
  }

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const publishableKey = readNamedSupabaseKey(
      "SUPABASE_PUBLISHABLE_KEYS",
      "SUPABASE_ANON_KEY",
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

    const accessToken = await getGoogleAccessToken();
    if (mode === "active_dates") {
      if (!month) return jsonResponse({ error: "無效的月份" }, 400);
      const activeDates = await getCalendarActiveDates(month, accessToken);
      return jsonResponse({
        ok: true,
        month: month.value,
        time_zone: TAIPEI_TIME_ZONE,
        active_dates: activeDates,
      });
    }

    if (!date) return jsonResponse({ error: "無效的日期" }, 400);
    const events = await getCalendarEvents(date, accessToken);

    return jsonResponse({
      ok: true,
      date: date.value,
      time_zone: TAIPEI_TIME_ZONE,
      events,
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "讀取 Google Calendar 時發生未知錯誤";

    console.error("get-calendar-events failed", message);
    return jsonResponse({ error: message }, 500);
  }
});
