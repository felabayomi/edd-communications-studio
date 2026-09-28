-- Run manually after 001_editions.sql and 002_destinations.sql.
-- Link management only; stores no submissions, recipients, or reviewer accounts.
BEGIN;
CREATE TABLE IF NOT EXISTS submission_forms (
 id uuid PRIMARY KEY,
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
 url text NOT NULL DEFAULT '' CHECK (url='' OR (url ~* '^https://' AND length(url)<=2048)),
 description text NOT NULL DEFAULT '',
 audience text NOT NULL DEFAULT '',
 form_type text NOT NULL DEFAULT 'Other',
 active boolean NOT NULL DEFAULT false,
 notes text NOT NULL DEFAULT '',
 publication_targets jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(publication_targets)='array'),
 content_categories jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(content_categories)='array'),
 expose_as_destination boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (NOT (active OR expose_as_destination) OR url<>'')
);
CREATE INDEX IF NOT EXISTS submission_forms_name_idx ON submission_forms (lower(name),id);
INSERT INTO submission_forms (id,name,description,audience,form_type,publication_targets,content_categories) VALUES
 ('b0000000-0000-4000-8000-000000000001','EdD Alumni Updates & Accomplishments Form','Institutional form for alumni updates and accomplishments. URL awaiting creation.','EdD alumni','Alumni Updates & Accomplishments','[]','[]'),
 ('b0000000-0000-4000-8000-000000000002','EdD Student Experience & Story Submission Form','Institutional form for student experiences and stories. URL awaiting creation.','EdD students','Student Experience & Story Submission','[]','[]'),
 ('b0000000-0000-4000-8000-000000000003','EdD Communications Content Submission Form','Institutional form for proposed communications content. URL awaiting creation.','EdD program contributors','Communications Content Submission','["Program Letter","Newsletter","Either","Not sure"]','["Chair / Leadership Message","Important Program Update","Registration / Financial Aid","Upcoming Event","Resources / Student Support","Dissertation Journey","Residency","CPED","Student Spotlight","Alumni Spotlight","Faculty / Staff Update","Research / Public Scholarship","Opportunity","Community Co-working & Café","Reminder","Other"]')
ON CONFLICT (id) DO NOTHING;
COMMIT;
