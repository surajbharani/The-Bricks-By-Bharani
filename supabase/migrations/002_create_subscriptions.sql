create table if not exists public.subscriptions (
  user_id             uuid references auth.users(id) on delete cascade primary key,
  tier_id             text references public.tiers(id) not null default 'casual',
  status              text not null default 'active'
                        check (status in ('active', 'past_due', 'cancelled')),
  razorpay_sub_id     text,
  current_period_end  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "subscriptions_own_read" on public.subscriptions
  for select using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.subscriptions (user_id, tier_id, status)
  values (new.id, 'casual', 'active')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute procedure public.set_updated_at();
