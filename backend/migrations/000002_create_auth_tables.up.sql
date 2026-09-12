create table users (
    id uuid primary key default gen_random_uuid(),
    login_id varchar(45) not null unique,
    role varchar(16) not null,
    full_name varchar(100) not null,
    password_hash text not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint users_login_id_lowercase
        check (login_id = lower(login_id)),
    constraint users_login_id_format
        check (login_id ~ '^[a-z0-9]([a-z0-9._-]{0,30}[a-z0-9])?@(student|teacher)\.com$'),
    constraint users_role
        check (role in ('student', 'teacher')),
    constraint users_login_id_matches_role
        check (
            (role = 'student' and login_id like '%@student.com')
            or (role = 'teacher' and login_id like '%@teacher.com')
        ),
    constraint users_full_name_not_blank
        check (btrim(full_name) <> ''),
    constraint users_password_hash_not_blank
        check (btrim(password_hash) <> '')
);

create table sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users (id) on delete cascade,
    token_hash bytea not null unique,
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),

    constraint sessions_token_hash_length
        check (octet_length(token_hash) = 32),
    constraint sessions_expiry_after_creation
        check (expires_at > created_at)
);

create index sessions_user_id_idx on sessions (user_id);
create index sessions_expires_at_idx on sessions (expires_at);
