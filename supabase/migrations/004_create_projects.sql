-- Projects: named workspaces per user
create table if not exists projects (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references auth.users on delete cascade not null,
  name         text not null,
  description  text default '',
  system_prompt text default '',
  memory       text default '',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- Members (for future share-project feature)
create table if not exists project_members (
  project_id uuid references projects on delete cascade,
  user_id    uuid references auth.users on delete cascade,
  role       text not null default 'viewer',
  invited_at timestamptz default now(),
  primary key (project_id, user_id)
);

-- RLS: users can only see their own projects or ones they are members of
alter table projects enable row level security;
alter table project_members enable row level security;

create policy "owner can manage own projects"
  on projects for all
  using (auth.uid() = owner_id);

create policy "members can view projects"
  on projects for select
  using (
    exists (
      select 1 from project_members pm
      where pm.project_id = projects.id
        and pm.user_id = auth.uid()
    )
  );

create policy "owner can manage members"
  on project_members for all
  using (
    exists (
      select 1 from projects p
      where p.id = project_members.project_id
        and p.owner_id = auth.uid()
    )
  );

create policy "members can see their own membership"
  on project_members for select
  using (auth.uid() = user_id);

-- Auto-update updated_at
create or replace function update_projects_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_updated_at
  before update on projects
  for each row execute procedure update_projects_updated_at();
