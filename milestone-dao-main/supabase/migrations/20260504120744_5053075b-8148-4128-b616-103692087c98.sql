-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  wallet_address text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "Profiles viewable by everyone" on public.profiles for select using (true);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- PROJECTS
create type public.project_status as enum ('active', 'funded', 'failed', 'completed');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users on delete cascade,
  title text not null,
  description text not null,
  image_url text,
  goal_amount numeric not null check (goal_amount > 0),
  raised_amount numeric not null default 0,
  deadline timestamptz not null,
  status public.project_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.projects enable row level security;

create policy "Projects viewable by everyone" on public.projects for select using (true);
create policy "Authenticated users create projects" on public.projects for insert with check (auth.uid() = creator_id);
create policy "Creators update own projects" on public.projects for update using (auth.uid() = creator_id);
create policy "Creators delete own projects" on public.projects for delete using (auth.uid() = creator_id);

-- MILESTONES
create type public.milestone_status as enum ('pending', 'voting', 'approved', 'rejected', 'released');

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  title text not null,
  description text not null,
  amount numeric not null check (amount > 0),
  order_index int not null default 0,
  status public.milestone_status not null default 'pending',
  created_at timestamptz not null default now()
);
alter table public.milestones enable row level security;

create policy "Milestones viewable by everyone" on public.milestones for select using (true);
create policy "Project creators manage milestones" on public.milestones for all
  using (exists (select 1 from public.projects p where p.id = milestones.project_id and p.creator_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = milestones.project_id and p.creator_id = auth.uid()));

-- CONTRIBUTIONS
create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  backer_id uuid not null references auth.users on delete cascade,
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now()
);
alter table public.contributions enable row level security;

create policy "Contributions viewable by everyone" on public.contributions for select using (true);
create policy "Authenticated users contribute" on public.contributions for insert with check (auth.uid() = backer_id);
create policy "Backers update own contribution" on public.contributions for update using (auth.uid() = backer_id);
create policy "Backers delete own contribution" on public.contributions for delete using (auth.uid() = backer_id);

-- Update raised_amount on contribution
create or replace function public.update_project_raised()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.projects
  set raised_amount = (select coalesce(sum(amount), 0) from public.contributions where project_id = coalesce(new.project_id, old.project_id)),
      updated_at = now()
  where id = coalesce(new.project_id, old.project_id);
  return coalesce(new, old);
end;
$$;
create trigger contributions_update_raised
  after insert or update or delete on public.contributions
  for each row execute function public.update_project_raised();

-- MILESTONE VOTES
create table public.milestone_votes (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.milestones on delete cascade,
  voter_id uuid not null references auth.users on delete cascade,
  approve boolean not null,
  created_at timestamptz not null default now(),
  unique (milestone_id, voter_id)
);
alter table public.milestone_votes enable row level security;

create policy "Votes viewable by everyone" on public.milestone_votes for select using (true);
create policy "Backers cast votes" on public.milestone_votes for insert with check (auth.uid() = voter_id);
create policy "Voters update own vote" on public.milestone_votes for update using (auth.uid() = voter_id);
create policy "Voters delete own vote" on public.milestone_votes for delete using (auth.uid() = voter_id);

-- updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger projects_updated before update on public.projects for each row execute function public.set_updated_at();