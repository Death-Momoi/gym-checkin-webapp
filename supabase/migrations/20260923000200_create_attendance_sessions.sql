create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references public.profiles(id) on delete restrict,

  gym_role text not null default 'member'
    check (gym_role in ('primary', 'member')),

  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,

  checked_out_by uuid
    references public.profiles(id) on delete restrict,

  checkout_method text
    check (checkout_method in ('self', 'assisted')),

  transferred_to uuid
    references public.profiles(id) on delete restrict,

  trash_checked boolean,
  ac_lights_checked boolean,
  dehumidifier_checked boolean,

  note text
    check (note is null or char_length(note) <= 500),

  created_at timestamptz not null default now(),

  constraint attendance_valid_time
    check (
      checked_out_at is null
      or checked_out_at >= checked_in_at
    ),

  constraint attendance_valid_checkout_state
    check (
      (
        checked_out_at is null
        and checked_out_by is null
        and checkout_method is null
      )
      or
      (
        checked_out_at is not null
        and checked_out_by is not null
        and checkout_method is not null
      )
    ),

  constraint attendance_valid_checkout_actor
    check (
      checkout_method is null
      or (
        checkout_method = 'self'
        and checked_out_by = user_id
      )
      or (
        checkout_method = 'assisted'
        and checked_out_by <> user_id
      )
    ),

  constraint attendance_primary_not_assisted
    check (
      not (
        gym_role = 'primary'
        and checkout_method = 'assisted'
      )
    ),

  constraint attendance_transfer_primary_only
    check (
      transferred_to is null
      or gym_role = 'primary'
    ),

  constraint attendance_transfer_other_user
    check (
      transferred_to is null
      or transferred_to <> user_id
    ),

  constraint attendance_transfer_requires_checkout
    check (
      transferred_to is null
      or checked_out_at is not null
    ),

  constraint attendance_primary_checkout_checks
    check (
      checked_out_at is null
      or gym_role = 'member'
      or transferred_to is not null
      or (
        coalesce(trash_checked, false)
        and coalesce(ac_lights_checked, false)
        and coalesce(dehumidifier_checked, false)
      )
    )
);

comment on table public.attendance_sessions is
  'Gym check-in and check-out sessions';

create unique index attendance_one_open_session_per_user
on public.attendance_sessions (user_id)
where checked_out_at is null;

create index attendance_open_sessions
on public.attendance_sessions (checked_in_at)
where checked_out_at is null;

create index attendance_user_history
on public.attendance_sessions (user_id, checked_in_at desc);

alter table public.attendance_sessions enable row level security;

revoke all
on table public.attendance_sessions
from anon, authenticated;

grant select
on table public.attendance_sessions
to authenticated;

create policy "Authenticated users can read attendance"
on public.attendance_sessions
for select
to authenticated
using (true);
