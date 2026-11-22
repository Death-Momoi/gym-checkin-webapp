import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";
import { createHash, webcrypto } from "node:crypto";
import { test } from "node:test";

const source = (await fs.readFile(new URL("../supabase/functions/issue-presence-token/index.ts", import.meta.url), "utf8"))
  .replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2";\s*/u, "");
const executable = stripTypeScriptTypes(source);
const hash = (value) => createHash("sha256").update(value).digest("hex");

test("real issue-presence-token handler: 600 seconds, auth and storage", async () => {
  let handler, enabled = true, lookupError = null, writeError = null;
  const inserts = [], updates = [], cleanups = [];
  const secret = "test-only-device-secret";
  const client = {
    from(table) {
      if (table === "presence_devices") return {
        select() { return this; },
        eq(column, value) {
          if (column === "device_code") assert.equal(value, "room-esp32");
          else assert.equal(value, "33333333-3333-3333-3333-333333333333");
          return this;
        },
        async maybeSingle() {
          return {data: {id: "33333333-3333-3333-3333-333333333333", enabled, secret_hash: hash(secret)}, error: lookupError};
        },
        update(row) { updates.push(row); return this; }
      };
      assert.equal(table, "presence_qr_tokens");
      return {
        async insert(row) { inserts.push(row); return {error: writeError}; },
        delete() { return this; },
        async lt(column, value) { assert.equal(column, "expires_at"); cleanups.push(value); return {error: null}; }
      };
    }
  };
  const env = {
    SUPABASE_URL: "https://unit-test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-only-service-key",
    CHECKIN_APP_URL: "https://death-momoi.github.io/gym-checkin-webapp/"
  };
  vm.runInNewContext(executable, {
    Deno: {env: {get: (key) => env[key]}, serve: (fn) => { handler = fn; }},
    createClient: () => client,
    crypto: webcrypto, Request, Response, URL, TextEncoder, Uint8Array,
    btoa, Date, console: {error() {}}
  });
  const request = (method = "POST", suppliedSecret = secret) => new Request("https://unit-test.invalid", {
    method, headers: {"x-device-id": "room-esp32", "x-device-secret": suppliedSecret}
  });
  assert.equal((await handler(request("OPTIONS"))).status, 200);
  assert.equal((await handler(request("GET"))).status, 405);
  assert.equal((await handler(request("POST", ""))).status, 401);
  assert.equal((await handler(request("POST", "wrong"))).status, 401);
  enabled = false;
  assert.equal((await handler(request())).status, 401);
  enabled = true;
  assert.equal(inserts.length, 0);
  const first = await handler(request());
  assert.equal(first.status, 200);
  const body = await first.json();
  assert.equal(body.ok, true);
  assert.equal(body.expires_in, 600);
  assert.equal(Date.parse(body.expires_at) - Date.parse(body.issued_at), 600000);
  assert.match(body.token, /^[A-Za-z0-9_-]{24}$/u);
  assert.equal(new URL(body.check_in_url).searchParams.get("presence_token"), body.token);
  assert.equal(inserts[0].token_hash, hash(body.token));
  assert.equal(inserts[0].device_id, "33333333-3333-3333-3333-333333333333");
  assert.equal(inserts[0].expires_at, body.expires_at);
  assert(!Object.values(inserts[0]).includes(body.token));
  assert.equal(first.headers.get("cache-control"), "no-store");
  assert.equal(updates.length, 1);
  assert.equal(cleanups.length, 1);
  const second = await (await handler(request())).json();
  assert.notEqual(second.token, body.token);
  writeError = {message: "database rejected write"};
  assert.equal((await handler(request())).status, 500);
  writeError = null;
  lookupError = {code: "42P01"};
  assert.equal((await handler(request())).status, 500);
});
