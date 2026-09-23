create or replace function public.gym_check_in(
  requested_role text default 'member'
)
returns public.attendance_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_role text :=
    lower(btrim(coalesce(requested_role, 'member')));
  result public.attendance_sessions;
begin
  if current_user_id is null then
    raise exception '請先登入 Google 帳號';
  end if;

  if normalized_role not in ('primary', 'member') then
    raise exception '無效的簽到身分';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = current_user_id
      and status = 'active'
  ) then
    raise exception '使用者不存在或已停用';
  end if;

  insert into public.attendance_sessions (
    user_id,
    gym_role
  )
  values (
    current_user_id,
    normalized_role
  )
  on conflict (user_id)
    where checked_out_at is null
  do nothing
  returning * into result;

  if result.id is null then
    select *
    into result
    from public.attendance_sessions
    where user_id = current_user_id
      and checked_out_at is null
    limit 1;
  end if;

  return result;
end;
$$;


create or replace function public.gym_check_out(
  transfer_to_user_id uuid default null,
  trash_is_checked boolean default false,
  ac_lights_are_checked boolean default false,
  dehumidifier_is_checked boolean default false
)
returns public.attendance_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_session public.attendance_sessions;
  transfer_session public.attendance_sessions;
begin
  if current_user_id is null then
    raise exception '請先登入 Google 帳號';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = current_user_id
      and status = 'active'
  ) then
    raise exception '使用者不存在或已停用';
  end if;

  select *
  into current_session
  from public.attendance_sessions
  where user_id = current_user_id
    and checked_out_at is null
  limit 1
  for update;

  if current_session.id is null then
    select *
    into current_session
    from public.attendance_sessions
    where user_id = current_user_id
    order by checked_in_at desc
    limit 1;

    if current_session.id is null then
      raise exception '目前沒有簽到紀錄';
    end if;

    return current_session;
  end if;

  if current_session.gym_role = 'primary' then
    if transfer_to_user_id is not null then
      if transfer_to_user_id = current_user_id then
        raise exception '不能將責任交接給自己';
      end if;

      select attendance.*
      into transfer_session
      from public.attendance_sessions as attendance
      join public.profiles as profile
        on profile.id = attendance.user_id
      where attendance.user_id = transfer_to_user_id
        and attendance.checked_out_at is null
        and profile.status = 'active'
      limit 1
      for update of attendance;

      if transfer_session.id is null then
        raise exception '接替人員目前不在簽到狀態';
      end if;

      update public.attendance_sessions
      set gym_role = 'primary'
      where id = transfer_session.id;

      update public.attendance_sessions
      set
        checked_out_at = now(),
        checked_out_by = current_user_id,
        checkout_method = 'self',
        transferred_to = transfer_to_user_id,
        note = '主要借用者責任已交接'
      where id = current_session.id
      returning * into current_session;

    else
      if not (
        coalesce(trash_is_checked, false)
        and coalesce(ac_lights_are_checked, false)
        and coalesce(dehumidifier_is_checked, false)
      ) then
        raise exception '請完成垃圾、冷氣與電燈、除濕機三項檢查';
      end if;

      update public.attendance_sessions
      set
        checked_out_at = now(),
        checked_out_by = current_user_id,
        checkout_method = 'self',
        trash_checked = true,
        ac_lights_checked = true,
        dehumidifier_checked = true
      where id = current_session.id
      returning * into current_session;
    end if;

  else
    if transfer_to_user_id is not null then
      raise exception '共同使用者不能進行責任交接';
    end if;

    update public.attendance_sessions
    set
      checked_out_at = now(),
      checked_out_by = current_user_id,
      checkout_method = 'self'
    where id = current_session.id
    returning * into current_session;
  end if;

  return current_session;
end;
$$;


create or replace function public.gym_assist_check_out(
  target_user_id uuid
)
returns public.attendance_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  helper_user_id uuid := (select auth.uid());
  helper_name text;
  target_session public.attendance_sessions;
begin
  if helper_user_id is null then
    raise exception '請先登入 Google 帳號';
  end if;

  select display_name
  into helper_name
  from public.profiles
  where id = helper_user_id
    and status = 'active';

  if helper_name is null then
    raise exception '使用者不存在或已停用';
  end if;

  if target_user_id is null then
    raise exception '請選擇要協助簽退的人員';
  end if;

  if target_user_id = helper_user_id then
    raise exception '請使用正常簽退功能替自己簽退';
  end if;

  select *
  into target_session
  from public.attendance_sessions
  where user_id = target_user_id
    and checked_out_at is null
  limit 1
  for update;

  if target_session.id is null then
    raise exception '該使用者目前不在簽到狀態';
  end if;

  if target_session.gym_role = 'primary' then
    raise exception '主要借用者必須親自完成簽退';
  end if;

  update public.attendance_sessions
  set
    checked_out_at = now(),
    checked_out_by = helper_user_id,
    checkout_method = 'assisted',
    note = '由「' || helper_name || '」協助簽退'
  where id = target_session.id
  returning * into target_session;

  return target_session;
end;
$$;


revoke all
on function public.gym_check_in(text)
from public;

revoke all
on function public.gym_check_out(uuid, boolean, boolean, boolean)
from public;

revoke all
on function public.gym_assist_check_out(uuid)
from public;

grant execute
on function public.gym_check_in(text)
to authenticated;

grant execute
on function public.gym_check_out(uuid, boolean, boolean, boolean)
to authenticated;

grant execute
on function public.gym_assist_check_out(uuid)
to authenticated;
