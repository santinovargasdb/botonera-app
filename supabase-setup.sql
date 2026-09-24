-- == Botonesmata: esquema para botonera compartida ==
-- Ejecutar una sola vez en el SQL Editor del proyecto de Supabase.

-- Tabla de botones
create table public.botones (
  id uuid primary key default gen_random_uuid(),
  num int not null,
  titulo text not null,
  audio_path text not null,
  imagen_path text,
  creado timestamptz not null default now()
);

-- Botonera compartida sin login: cualquiera con la URL puede leer, agregar y borrar
alter table public.botones enable row level security;

create policy "lectura publica" on public.botones
  for select to anon using (true);

create policy "alta publica" on public.botones
  for insert to anon with check (true);

create policy "borrado publico" on public.botones
  for delete to anon using (true);

-- Bucket público para audios e imágenes
insert into storage.buckets (id, name, public)
values ('sonidos', 'sonidos', true);

create policy "lectura publica sonidos" on storage.objects
  for select to anon using (bucket_id = 'sonidos');

create policy "subida publica sonidos" on storage.objects
  for insert to anon with check (bucket_id = 'sonidos');

create policy "borrado publico sonidos" on storage.objects
  for delete to anon using (bucket_id = 'sonidos');
