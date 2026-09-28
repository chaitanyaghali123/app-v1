#!/usr/bin/env python
"""
UPSC Prelims dashboard — GS1 (Paper I) & GS2 (Paper II/CSAT) subject tree,
live counts pulled from upsc_chunks, no GPU/torch use.
"""
import os
import psycopg2
from psycopg2.pool import SimpleConnectionPool
from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = FastAPI(title="UPSC Prelims Dashboard")

pool = None

def init_pool():
    global pool
    pool = SimpleConnectionPool(1, 6,
        host=os.getenv("DB_HOST", os.getenv("PG_HOST", "postgres")),
        dbname=os.getenv("DB_NAME", os.getenv("PG_DB", "aryabhata_db")),
        user=os.getenv("DB_USER", os.getenv("PG_USER", "aryabhata_user")),
        password=os.getenv("DB_PASSWORD", os.getenv("PG_PASSWORD", "Password123")))

@app.get("/api/prelims")
def prelims():
    if pool is None:
        init_pool()
    conn = pool.getconn()
    try:
        cur = conn.cursor()
        # subject buckets for GS1 (Paper I)
        gs1 = {
            "History": ["history", "history-optional"],
            "Geography": ["geography"],
            "Polity": ["polity", "constitution"],
            "Economy": ["economy"],
            "Environment": ["environment", "disaster-management"],
            "Science & Technology": ["science-tech", "science"],
            "Current Affairs": ["current-affairs"],
        }
        # GS2 (Paper II / CSAT) — map from available buckets where present
        gs2 = {
            "Reading Comprehension": ["social-justice"],
            "Reasoning": [],
            "Logical / Analytical": [],
            "Basic Numeracy": [],
            "Data Interpretation": [],
            "Decision Making": ["disaster-management"],
            "Communication / Interpersonal": ["governance"],
        }
        out = []
        for paper, subjmap in ((1, gs1), (2, gs2)):
            paper_buckets = []
            for label, subs in subjmap.items():
                q = ("SELECT COUNT(*) total, "
                     "COUNT(*) FILTER (WHERE embedding IS NOT NULL) embedded "
                     "FROM prelims_chunks WHERE subject_id IN %s")
                cur.execute(q, (tuple(subs),) if subs else (("__none__",),))
                t, e = cur.fetchone()
                paper_buckets.append({"label": label, "subjects": subs,
                                      "chunks": t, "embedded": e})
            out.append({"paper": paper, "paper_label": "Paper I — GS" if paper == 1 else "Paper II — CSAT",
                        "buckets": paper_buckets})
        # totals
        cur.execute("SELECT COUNT(*), COUNT(*) FILTER (WHERE embedding IS NOT NULL) FROM prelims_chunks")
        tot, emb = cur.fetchone()
        return {"gs1": out[0], "gs2": out[1], "totals": {"chunks": tot, "embedded": emb}}
    finally:
        pool.putconn(conn)

HTML = """
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>UPSC Prelims Dashboard</title>
<style>
  :root { --ink:#1f2430; --muted:#6b7280; --line:#e5e7eb; --accent:#4f46e5; --ok:#059669; }
  * { box-sizing:border-box; }
  body { font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif; color:var(--ink);
         background:#f6f7fb; margin:0; padding:24px; }
  h1 { font-size:22px; margin:0 0 4px; }
  .sub { color:var(--muted); font-size:13px; margin-bottom:18px; }
  .paper { background:#fff; border:1px solid var(--line); border-radius:10px;
           padding:18px; margin-bottom:18px; }
  .paper h2 { font-size:15px; margin:0 0 12px; }
  .paper h2 .tag { font-size:11px; color:var(--ok); font-weight:600; margin-left:8px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:12px; }
  .card { border:1px solid var(--line); border-radius:8px; padding:12px; background:#fafbfd; }
  .card h3 { font-size:14px; margin:0 0 8px; }
  .row { display:flex; justify-content:space-between; font-size:12px; color:var(--muted); margin-top:3px; }
  .row b { color:var(--ink); font-weight:600; }
  .bar { height:6px; background:#eef0f4; border-radius:3px; margin-top:8px; overflow:hidden; }
  .bar i { display:block; height:100%; background:var(--accent); border-radius:3px; }
  .totals { display:flex; gap:24px; margin-bottom:18px; font-size:13px; }
  .totals div { background:#fff; border:1px solid var(--line); border-radius:8px; padding:12px 16px; }
  .totals b { font-size:20px; display:block; }
</style>
</head>
<body>
<h1>UPSC Prelims — Subject Coverage</h1>
<div class="sub">Live chunk &amp; embedding status per subject • Updated automatically</div>
<div class="totals">
  <div>Total chunks <b id="tot"></b></div>
  <div>Embedded <b id="emb"></b></div>
  <div id="meta"></div>
</div>
<div id="papers"></div>
<script>
async function render() {
  const d = await (await fetch('/api/prelims')).json();
  document.getElementById('tot').textContent = d.totals.chunks.toLocaleString();
  document.getElementById('emb').textContent = d.totals.embedded.toLocaleString();
  document.getElementById('meta').innerHTML = 'Updated ' + new Date().toLocaleTimeString();
  const box = document.getElementById('papers');
  box.innerHTML = '';
  for (const p of [d.gs1, d.gs2]) {
    let pct = p.buckets.length ? p.buckets.reduce((a,b)=>a+b.embedded,0) : 0;
    let tot = p.buckets.length ? p.buckets.reduce((a,b)=>a+b.chunks,0) : 0;
    let div = document.createElement('div');
    div.className = 'paper';
    div.innerHTML = '<h2>' + p.paper_label +
      '<span class="tag">' + (tot? Math.round(pct/tot*100):0) + '% embedded</span></h2>';
    const g = document.createElement('div'); g.className = 'grid';
    for (const b of p.buckets) {
      const pcn = b.chunks ? Math.round(b.embedded/b.chunks*100) : 0;
      const c = document.createElement('div'); c.className = 'card';
      c.innerHTML = '<h3>' + b.label + '</h3>' +
        '<div class="row"><span>chunks</span><b>' + b.chunks.toLocaleString() + '</b></div>' +
        '<div class="row"><span>embedded</span><b>' + b.embedded.toLocaleString() + '</b></div>' +
        '<div class="bar"><i style="width:' + pcn + '%"></i></div>';
      g.appendChild(c);
    }
    div.appendChild(g); box.appendChild(div);
  }
}
render(); setInterval(render, 15000);
</script>
</body>
</html>
"""

@app.get("/", response_class=HTMLResponse)
def index():
    return HTML

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("prelims_api:app", host="0.0.0.0", port=int(os.getenv("PRELIMS_PORT", "7861")), log_level="warning")