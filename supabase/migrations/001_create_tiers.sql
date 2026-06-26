create table if not exists public.tiers (
  id              text primary key,
  label           text not null,
  price_inr       int  not null default 0,
  daily_token_cap bigint not null,
  monthly_inr_cap int  not null,
  description     text
);

alter table public.tiers enable row level security;

create policy "tiers_public_read" on public.tiers
  for select using (true);

insert into public.tiers (id, label, price_inr, daily_token_cap, monthly_inr_cap, description) values
  ('casual',     'Casual',     0,    50000,   50,   'Free — great for trying out Nano Bricks'),
  ('pro',        'Pro',        499,  500000,  500,  'For power users who need more every day'),
  ('enterprise', 'Enterprise', 1999, 5000000, 2000, 'Full power — for teams and heavy workflows')
on conflict (id) do nothing;
