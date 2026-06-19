-- =====================================================================
-- LES CIMES DU VAL D'ALLOS — App client (EDL / satisfaction / activités)
-- Région : EU (RGPD). Aucune policy anon. Accès via Edge Functions only.
-- =====================================================================

-- ---------- ADMINS AUTORISÉS ----------
-- Un compte Supabase Auth n'accède au dashboard QUE s'il est listé ici.
create table if not exists admins (
  user_id uuid primary key,            -- = auth.users.id
  email   text,
  created_at timestamptz not null default now()
);

-- ---------- TABLES ----------

-- Appartements (cible des QR codes fixes)
create table if not exists appartements (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,          -- utilisé dans l'URL du QR : /a/{slug}
  nom         text not null,                 -- ex. "T2 Edelweiss"
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Séjours (1 ligne par réservation)
create table if not exists sejours (
  id             uuid primary key default gen_random_uuid(),
  appartement_id uuid not null references appartements(id) on delete cascade,
  nom_client     text not null,
  email          text not null,
  date_arrivee   date not null,
  date_depart    date not null,
  -- Consentements RGPD séparés par finalité
  consent_rgpd       boolean not null default false,  -- traitement EDL/séjour
  consent_marketing  boolean not null default false,  -- relance offres
  -- Purge RGPD : calculée à la création (checkout + 12 mois)
  purge_after    date,
  created_at     timestamptz not null default now()
);
create index if not exists idx_sejours_lookup
  on sejours (appartement_id, date_arrivee, lower(email));

-- États des lieux (entrée / sortie)
create table if not exists edl (
  id          uuid primary key default gen_random_uuid(),
  sejour_id   uuid not null references sejours(id) on delete cascade,
  type        text not null check (type in ('entree','sortie')),
  rempli_par  text not null check (rempli_par in ('client','staff')),
  signature   text,                          -- base64 du tracé (commencement de preuve)
  commentaire_general text,
  created_at  timestamptz not null default now()
);

create table if not exists edl_pieces (
  id        uuid primary key default gen_random_uuid(),
  edl_id    uuid not null references edl(id) on delete cascade,
  piece     text not null,                   -- ex. "Cuisine", "Chambre 1"
  etat      text check (etat in ('bon','moyen','mauvais')),
  commentaire text
);

create table if not exists edl_photos (
  id           uuid primary key default gen_random_uuid(),
  edl_id       uuid not null references edl(id) on delete cascade,
  piece        text,
  storage_path text not null,                -- chemin dans le bucket Supabase Storage
  created_at   timestamptz not null default now()
);

-- Incidents signalés PENDANT le séjour
create table if not exists incidents (
  id         uuid primary key default gen_random_uuid(),
  sejour_id  uuid not null references sejours(id) on delete cascade,
  categorie  text,                           -- ex. "Équipement", "Propreté", "Bruit"
  message    text not null,
  statut     text not null default 'nouveau' check (statut in ('nouveau','en_cours','resolu')),
  created_at timestamptz not null default now()
);

-- Enquête MID-STAY (pendant le séjour, courte, opérationnelle)
-- Chaque question est OK/KO ; un KO génère un incident + alerte.
create table if not exists midstay (
  id          uuid primary key default gen_random_uuid(),
  sejour_id   uuid not null references sejours(id) on delete cascade,
  -- réponses booléennes (true = tout va bien)
  logement_ok boolean,
  equipements_ok boolean,
  proprete_ok boolean,
  commentaire text,
  created_at  timestamptz not null default now()
);

-- Enquête POST-séjour INTERNE (critères notés 1-5 + NPS + verbatim)
-- 100% interne : aucun routage vers avis public.
create table if not exists satisfaction (
  id              uuid primary key default gen_random_uuid(),
  sejour_id       uuid not null references sejours(id) on delete cascade,
  note_accueil    int check (note_accueil between 1 and 5),
  note_proprete   int check (note_proprete between 1 and 5),
  note_equipements int check (note_equipements between 1 and 5),
  note_literie    int check (note_literie between 1 and 5),
  note_qualite_prix int check (note_qualite_prix between 1 and 5),
  nps             int check (nps between 0 and 10),
  point_positif   text,
  point_amelioration text,
  created_at      timestamptz not null default now()
);

-- Activités (liste éditoriale, gérée par l'admin)
create table if not exists activites (
  id          uuid primary key default gen_random_uuid(),
  titre       text not null,
  description text,
  categorie   text,                          -- ex. "Randonnée", "Famille", "Restauration"
  image_url   text,
  lien        text,
  actif       boolean not null default true,
  ordre       int not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- PURGE RGPD AUTOMATIQUE ----------
-- À la création d'un séjour : purge_after = date_depart + 13 mois
create or replace function set_purge_after()
returns trigger language plpgsql as $$
begin
  if new.purge_after is null then
    new.purge_after := new.date_depart + interval '12 months';
  end if;
  return new;
end; $$;

drop trigger if exists trg_set_purge on sejours;
create trigger trg_set_purge
  before insert on sejours
  for each row execute function set_purge_after();

-- Fonction de purge (à appeler via cron Supabase)
-- Supprime les séjours échus → cascade sur edl/photos/incidents/satisfaction.
-- ⚠️ Les fichiers du Storage doivent être purgés séparément (voir Edge Function purge).
create or replace function purge_sejours_echus()
returns int language plpgsql security definer as $$
declare n int;
begin
  with del as (
    delete from sejours where purge_after < current_date returning 1
  )
  select count(*) into n from del;
  return n;
end; $$;

-- ---------- RLS : TOUT FERMÉ ----------
-- Aucune policy → le rôle anon ne peut RIEN lire/écrire.
-- Tout passe par les Edge Functions qui utilisent la service_role key (côté serveur).
alter table appartements  enable row level security;
alter table admins        enable row level security;
alter table sejours       enable row level security;
alter table edl           enable row level security;
alter table edl_pieces    enable row level security;
alter table edl_photos    enable row level security;
alter table incidents     enable row level security;
alter table midstay       enable row level security;
alter table satisfaction  enable row level security;
alter table activites     enable row level security;
-- (volontairement aucune CREATE POLICY : accès uniquement via service_role)

-- ---------- BOOTSTRAP ADMIN ----------
-- 1) Crée ton compte dans Supabase Auth (dashboard > Authentication > Add user).
-- 2) Récupère son user_id (UUID) et insère-le ici :
--    insert into admins (user_id, email) values ('<TON_UUID>', 'bruno@...');

-- ---------- STORAGE ----------
-- Crée un bucket PRIVÉ nommé 'edl-photos' depuis le dashboard Supabase.
-- Les uploads/downloads passent par l'Edge Function (signed URLs).
