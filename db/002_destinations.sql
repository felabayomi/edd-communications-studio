-- Run manually in edd_communications_studio, after 001_editions.sql.
-- This migration neither rewrites editions nor uploads browser-local content.
BEGIN;
CREATE TABLE IF NOT EXISTS destinations (
 id uuid PRIMARY KEY,
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
 url text NOT NULL CHECK (url ~* '^https://' AND length(url) <= 2048),
 category text NOT NULL DEFAULT '' CHECK (length(category) <= 100),
 active boolean NOT NULL DEFAULT true,
 legacy_id text,
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS destinations_name_idx ON destinations (lower(name), id);
INSERT INTO destinations (id,legacy_id,name,url,category) VALUES
 ('a0000000-0000-4000-8000-000000000001','support','Student Support','https://sites.google.com/antioch.edu/eddcommunitycenter/support','Program Support'),
 ('a0000000-0000-4000-8000-000000000002','hub','EdD Community Center','https://sites.google.com/antioch.edu/eddcommunitycenter/edd-program-info','Community Center'),
 ('a0000000-0000-4000-8000-000000000003','faq','EdD Community Center FAQ','https://sites.google.com/antioch.edu/eddcommunitycenter/edd-program-info/faqs-page','Community Center'),
 ('a0000000-0000-4000-8000-000000000004','cafe','Community Co-working & Café Zoom','https://antioch.zoom.us/j/94176225683','Events/Zoom'),
 ('a0000000-0000-4000-8000-000000000005','journey','EdD Dissertation Journey Zoom','https://antioch.zoom.us/j/93810024463','Events/Zoom'),
 ('a0000000-0000-4000-8000-000000000006','library','Antioch University Library','https://www.antioch.edu/departments/library/','Library & Research'),
 ('a0000000-0000-4000-8000-000000000007','library-workshops','Upcoming Library Workshops','https://libcal.antioch.edu/calendar/aulibraryevents','Library & Research')
ON CONFLICT (id) DO NOTHING;
COMMIT;
