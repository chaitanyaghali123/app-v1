# essay_ingest.py
# ==========================================================
# Seed the UPSC Mains Essay knowledge base.
#
# By default seeds QUOTE / ANECDOTE / FRAMEWORK entries WITHOUT
# embedding (embed=False, no API calls), so the corpus is safe to
# load even while the embed quota is exhausted. Entities are then
# vectorised later in one batch via backfill_embeds() (see
# run_essay_backfill.py) or by re-running with embed=True.
# ==========================================================

import logging

from essay_kb import upsert_entry, backfill_embeds, count_unembedded
from essay_quotes_content import ALL_QUOTES
from essay_anecdotes_content import ALL_ANECDOTES
from essay_rules_content import ALL_RULES

logger = logging.getLogger(__name__)


def _upsert_list(entries, content_type, embed):
    done = 0
    for e in entries:
        try:
            upsert_entry(
                content_type=content_type,
                theme=e["theme"],
                title=e["title"],
                content_text=e.get("content_text"),
                author=e.get("author", ""),
                source_origin=e.get("source_origin", "ORIGINAL_SYNTHESIS"),
                source_url=e.get("source_url"),
                tags=e.get("tags", []),
                embed=embed,
            )
            done += 1
        except Exception as exc:
            logger.warning(f"seed failed [{content_type}] {e.get('title')}: {exc}")
    return done


def seed_all(embed=False):
    """Upsert all curated essay content, optionally embedding."""
    n = 0
    n += _upsert_list(ALL_QUOTES, "QUOTE", embed)
    n += _upsert_list(ALL_ANECDOTES, "ANECDOTE", embed)
    n += _upsert_list(ALL_RULES, "FRAMEWORK", embed)
    return n


def total():
    return len(ALL_QUOTES) + len(ALL_ANECDOTES) + len(ALL_RULES)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    from essay_kb import ensure_table, kb_stats

    ensure_table()
    n = seed_all(embed=False)
    print(f"Seeded {n}/{total()} essay entries (embed=False)")
    print(kb_stats())
