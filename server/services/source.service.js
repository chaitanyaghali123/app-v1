import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
});

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT_URL,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET = process.env.R2_BUCKET || "upsc-rag-docs";

const GS_PAPER_SUBJECTS = {
  gs1: ["history", "culture", "heritage", "geography", "society"],
  gs2: ["polity", "constitution", "governance", "international", "international-relations", "social-justice"],
  gs3: ["economy", "science", "science-tech", "environment", "disaster-management", "disaster", "internal-security"],
  gs4: ["ethics"],
};

const SUBJECT_DISPLAY = {
  history: "History",
  culture: "Art & Culture",
  heritage: "Indian Heritage & Art",
  geography: "Geography",
  society: "Indian Society",
  polity: "Polity",
  constitution: "Constitution",
  governance: "Governance",
  international: "International Relations",
  "international-relations": "International Relations",
  economy: "Economy",
  science: "Science",
  "science-tech": "Science & Technology",
  environment: "Environment & Ecology",
  "disaster-management": "Disaster Management",
  disaster: "Disaster Management",
  "internal-security": "Internal Security",
  ethics: "Ethics & Integrity",
};

const SUBJECT_TO_GS = {
  history: "gs1", culture: "gs1", heritage: "gs1", geography: "gs1", society: "gs1",
  polity: "gs2", constitution: "gs2", governance: "gs2", international: "gs2",
  "international-relations": "gs2",
  economy: "gs3", science: "gs3", "science-tech": "gs3", environment: "gs3",
  "disaster-management": "gs3", disaster: "gs3", "internal-security": "gs3",
  ethics: "gs4",
};

function cleanFileName(file_name) {
  const base = file_name.split("/").pop() || file_name;
  return base.replace(/\.pdf$/i, "").replace(/_/g, " ").replace(/-/g, " ");
}

function buildR2Key(file_name, subject_id) {
  const parts = file_name.split("/");
  if (parts.length === 2) {
    const subjectFolder = parts[0];
    const gs = SUBJECT_TO_GS[subjectFolder];
    if (gs) return `${gs}/${file_name}`;
  }
  if (subject_id && SUBJECT_TO_GS[subject_id]) {
    return `${SUBJECT_TO_GS[subject_id]}/${subject_id}/${parts[parts.length - 1]}`;
  }
  return file_name;
}

function sortKey(fileName) {
  const base = fileName.split("/").pop() || fileName;
  const classMatch = base.match(/Class(\d+)/i);
  const classNum = classMatch ? parseInt(classMatch[1], 10) : 99;
  const partMatch = base.match(/Part(\d+)/i);
  const partNum = partMatch ? parseInt(partMatch[1], 10) : 0;
  const isNcert = /ncert/i.test(base) ? 0 : 1;
  const isNios = /nios/i.test(base) ? 2 : isNcert;
  const isArc = /arc_/i.test(base) ? 3 : isNios;
  const isGuide = /guide/i.test(base) ? 4 : isArc;
  return [classNum, partNum, isGuide, base];
}

async function getSourceList(paper) {
  const subjects = GS_PAPER_SUBJECTS[paper];
  if (!subjects) return [];

  const { rows } = await pool.query(
    `SELECT DISTINCT file_name, subject_id
     FROM documents
     WHERE subject_id = ANY($1)`,
    [subjects]
  );

  const seen = new Map();
  for (const row of rows) {
    const base = (row.file_name.split("/").pop() || row.file_name).replace(/\.pdf$/i, "");
    if (seen.has(base)) {
      const existing = seen.get(base);
      if (row.file_name.includes("/") && !existing.file_name.includes("/")) {
        seen.set(base, row);
      }
      continue;
    }
    seen.set(base, row);
  }

  const results = [];
  for (const row of seen.values()) {
    results.push({
      subject_id: row.subject_id,
      subject_name: SUBJECT_DISPLAY[row.subject_id] || row.subject_id,
      file_name: row.file_name,
      r2_key: buildR2Key(row.file_name, row.subject_id),
      display_name: cleanFileName(row.file_name),
    });
  }

  results.sort((a, b) => {
    const sa = sortKey(a.file_name);
    const sb = sortKey(b.file_name);
    for (let i = 0; i < Math.min(sa.length, sb.length); i++) {
      if (sa[i] < sb[i]) return -1;
      if (sa[i] > sb[i]) return 1;
    }
    return a.file_name.localeCompare(b.file_name);
  });

  return results;
}

async function streamR2File(r2Key, res) {
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: r2Key });
    const response = await r2.send(command);
    res.setHeader("Content-Type", response.ContentType || "application/pdf");
    if (response.ContentLength) {
      res.setHeader("Content-Length", String(response.ContentLength));
    }
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Accept-Ranges", "bytes");
    response.Body.pipe(res);
  } catch (err) {
    console.error(`R2 proxy error for ${r2Key}:`, err.message);
    res.status(404).json({ error: "File not found" });
  }
}

export { getSourceList, streamR2File };
