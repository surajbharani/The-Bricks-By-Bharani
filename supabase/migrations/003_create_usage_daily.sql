create table if not exists public.usage_daily (
  user_id           uuid references auth.users(id) on delete cascade,
  day               date not null,
  prompt_tokens     bigint not null default 0,
  completion_tokens bigint not null default 0,
  est_inr           numeric(10, 4) not null default 0,
  primary key (user_id, day)
);

alter table public.usage_daily enable row level security;

create policy "usage_own_read" on public.usage_daily
  for select using (auth.uid() = user_id);

create or replace function public.upsert_usage_daily(
  p_user_id           uuid,
  p_day               date,
  p_prompt_tokens     bigint,
  p_completion_tokens bigint,
  p_est_inr           numeric
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.usage_daily (user_id, day, prompt_tokens, completion_tokens, est_inr)
  values (p_user_id, p_day, p_prompt_tokens, p_completion_tokens, p_est_inr)
  on conflict (user_id, day) do update set
    prompt_tokens     = usage_daily.prompt_tokens     + excluded.prompt_tokens,
    completion_tokens = usage_daily.completion_tokens + excluded.completion_tokens,
    est_inr           = usage_daily.est_inr           + excluded.est_inr;
end;
$$;
