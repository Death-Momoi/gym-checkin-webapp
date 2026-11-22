import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
const { PGlite } = await import(process.env.QA_NODE_MODULES
  ? pathToFileURL(process.env.QA_NODE_MODULES + "/@electric-sql/pglite/dist/index.js")
  : "@electric-sql/pglite");
const hash = (value) => createHash("sha256").update(value).digest("hex");

test("10-minute migration, rerun, expiry RPC and reusable check-in", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema extensions;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      create function extensions.digest(value bytea, algorithm text) returns bytea language sql immutable strict as $$
        select case when algorithm='sha256' then pg_catalog.sha256(value) else null::bytea end $$;
      create table public.profiles(id uuid primary key, status text);
      create table public.attendance_sessions(
        id uuid primary key default gen_random_uuid(), user_id uuid not null,
        gym_role text not null, checked_out_at timestamptz);
      create unique index one_open_session on public.attendance_sessions(user_id) where checked_out_at is null;
      create function public.set_profile_updated_at() returns trigger language plpgsql as $$
        begin new.updated_at=now(); return new; end $$;
      create function public.gym_check_in(requested_role text) returns void language sql as $$ select $$;
      grant usage on schema public,auth to anon,authenticated;
      insert into public.profiles values
        ('11111111-1111-1111-1111-111111111111','active'),
        ('22222222-2222-2222-2222-222222222222','active');
    `);
    // Use the original migration. PGlite uses PostgreSQL's built-in SHA256 in place of pgcrypto only for this local test.
    const original = (await fs.readFile(new URL("../supabase/migrations/20260927000100_create_presence_qr_check_in.sql", import.meta.url), "utf8"))
      .replace("create extension if not exists pgcrypto with schema extensions;", "");
    await db.exec(original);
    await db.exec(`insert into presence_devices(id,device_code,display_name,secret_hash)
      values('33333333-3333-3333-3333-333333333333','room-esp32','Room',repeat('a',64))`);
    const insert = async (token, issued, expires) => db.query(
      "insert into presence_qr_tokens(token_hash,device_id,issued_at,expires_at) values($1,'33333333-3333-3333-3333-333333333333',$2,$3)",
      [hash(token), issued.toISOString(), expires.toISOString()]);
    const now = new Date();
    const tenMinutes = new Date(now.getTime() + 600000);
    await assert.rejects(insert("old-limit-10-minute-token", now, tenMinutes), /check constraint/u);
    const migration = await fs.readFile(new URL("../supabase/migrations/20261122000200_presence_token_10_minutes.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec(migration);
    const token = "shared-valid-10-minute-token";
    await insert(token, now, tenMinutes);
    await assert.rejects(insert("over-limit-10-minute-token", now, new Date(tenMinutes.getTime() + 1)), /check constraint/u);
    await assert.rejects(insert("zero-duration-test-token", now, now), /check constraint/u);
    const expired = "expired-test-presence-token";
    await insert(expired, new Date(now.getTime() - 610000), new Date(now.getTime() - 10000));
    await db.exec("set role anon");
    await assert.rejects(db.exec("select * from presence_qr_tokens"), /permission denied/u);
    let status = (await db.query("select * from presence_token_status($1)", [token])).rows[0];
    assert.equal(status.is_valid, true);
    status = (await db.query("select * from presence_token_status($1)", [expired])).rows[0];
    assert.equal(status.is_valid, false);
    for (const user of ["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"]) {
      await db.exec("set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      const session = (await db.query("select * from gym_check_in_with_presence($1,'member')", [token])).rows[0];
      assert.equal(session.user_id, user);
      const again = (await db.query("select * from gym_check_in_with_presence($1,'member')", [token])).rows[0];
      assert.equal(again.id, session.id);
      await assert.rejects(db.query("select * from gym_check_in_with_presence($1,'member')", [expired]), /已過期/u);
    }
    await db.exec("reset role");
    assert.equal((await db.query("select count(*)::int as n from attendance_sessions")).rows[0].n, 2);
    await db.exec("update presence_devices set enabled=false; set role anon");
    assert.equal((await db.query("select * from presence_token_status($1)", [token])).rows[0].is_valid, false);
  } finally {
    await db.close();
  }
});
