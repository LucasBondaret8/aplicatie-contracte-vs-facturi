-- Rulati tot fisierul o singura data in Supabase: SQL Editor -> New query -> Run.
-- Creeaza cele 2 bucket-uri private si tabelele pentru demo.

-- 1. Bucket-uri (dosarele pentru fisiere), private
insert into storage.buckets (id, name, public)
values ('contracte', 'contracte', false),
       ('facturi',   'facturi',   false)
on conflict (id) do nothing;

-- 2. Contractele: ce scrie in contract (completat de AI din PDF)
create table if not exists contracte (
  id            uuid primary key default gen_random_uuid(),
  nr_contract   text unique,               -- ex: TN-2025-0117 (apare si pe factura)
  furnizor      text,
  furnizor_cui  text,
  cale_fisier   text not null,             -- unde e PDF-ul in bucket-ul "contracte"
  termeni       jsonb,                     -- JSON-ul extras de AI (pret, indexare, discount...)
  creat_la      timestamptz default now()
);

-- 3. Facturile: ce s-a facturat (citit de cod din XML) + rezultatul comparatiei
create table if not exists facturi (
  id            uuid primary key default gen_random_uuid(),
  nr_factura    text unique,
  furnizor      text,
  furnizor_cui  text,
  nr_contract   text references contracte (nr_contract),
  data_emitere  date,
  total         numeric,
  cale_fisier   text not null,             -- unde e XML-ul in bucket-ul "facturi"
  linii         jsonb,                     -- liniile citite din XML
  verificare    text check (verificare in ('CONFORM', 'NECONFORM', 'DE VERIFICAT')),
  detalii       text,                      -- ex: "Pret 22,40 > maxim 21,12 (Art. 5.2)"
  creat_la      timestamptz default now()
);

-- 4. Acces
-- ATENTIE: regulile de mai jos lasa pe oricine cu cheia "anon" sa citeasca datele.
-- E acceptabil DOAR pentru demo, cu date fictive. Pentru date reale: login + reguli pe firma.
alter table contracte enable row level security;
alter table facturi   enable row level security;

create policy "demo citire contracte" on contracte for select to anon, authenticated using (true);
create policy "demo citire facturi"   on facturi   for select to anon, authenticated using (true);

create policy "demo citire fisiere" on storage.objects for select to anon, authenticated
  using (bucket_id in ('contracte', 'facturi'));
