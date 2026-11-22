-- 先在 SQL Editor 執行本檔，再部署 600 秒的 issue-presence-token。
-- 只放寬有效期上限，不刪表、不清資料，也不延長既有 Token 的 expires_at。
begin;
alter table public.presence_qr_tokens
  drop constraint if exists presence_qr_token_valid_lifetime;
alter table public.presence_qr_tokens
  add constraint presence_qr_token_valid_lifetime
  check (
    expires_at > issued_at
    and expires_at <= issued_at + interval '10 minutes'
  );
comment on constraint presence_qr_token_valid_lifetime
  on public.presence_qr_tokens is
  'Positive lifetime up to 10 minutes; the server checks expires_at at check-in.';
commit;
