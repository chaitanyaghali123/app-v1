import ingest_hybrid as I

orig = ("Federalism is a system of government in which power is divided between "
        "a central authority and constituent political units. In India, the "
        "Constitution establishes a federal structure with a strong central "
        "government. The Seventh Schedule divides subjects between the Union List, "
        "State List, and Concurrent List.")
ab = I.abstract_one(orig)
print("ORIG:", orig)
print()
print("ABSTRACT:")
print(ab)
print()
# crude verbatim-overlap check
words_a = set(orig.lower().split())
if ab:
    n_shared = sum(1 for w in ab.lower().split() if w in words_a)
    print(f"shared word tokens with source: {n_shared} / {len(ab.split())}")