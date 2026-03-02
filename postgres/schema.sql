CREATE TABLE upsc_chunks (
  id TEXT PRIMARY KEY,
  chunk TEXT
);

CREATE TABLE upsc_meta (
  id TEXT PRIMARY KEY,
  source TEXT,
  topic TEXT,
  difficulty TEXT
);
