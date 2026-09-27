CREATE TABLE IF NOT EXISTS editions (
  id uuid PRIMARY KEY,
  publication_type text NOT NULL CHECK (publication_type IN ('program-letter', 'newsletter')),
  title text NOT NULL,
  edition text NOT NULL,
  semester text NOT NULL,
  academic_year text NOT NULL,
  audience text NOT NULL,
  editorial_status text NOT NULL CHECK (editorial_status IN ('Draft', 'Ready for Review', 'Approved', 'Distributed')),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS editions_updated_at_idx ON editions (updated_at DESC, id);
