-- Add SEO/compliance fields required by blog publishing rules.
alter table if exists public.blogs
  add column if not exists primary_keyword text,
  add column if not exists meta_description text,
  add column if not exists key_takeaways jsonb not null default '[]'::jsonb,
  add column if not exists faq_items jsonb not null default '[]'::jsonb,
  add column if not exists external_sources jsonb not null default '[]'::jsonb;

comment on column public.blogs.primary_keyword is 'Primary SEO keyword for the article';
comment on column public.blogs.meta_description is 'Meta description (target length: 155 chars)';
comment on column public.blogs.key_takeaways is 'Top 5 key takeaways shown near top of article';
comment on column public.blogs.faq_items is 'FAQ list for visible section + FAQPage JSON-LD';
comment on column public.blogs.external_sources is 'Authoritative references cited in article';
