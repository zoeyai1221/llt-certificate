#!/usr/bin/env python3
"""Regenerate the learner globe's data files from the registration CSV.

Reads  ./LearnerRegistration.csv   (same folder as this script)
Writes ./country-counts.js         (learner counts keyed by map polygon name)
       ./world-geo.js              (world polygons; regenerated only if missing)

Run from the demo/assets folder:  python3 build-globe-data.py
"""
import csv
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(HERE, "LearnerRegistration.csv")
WORLD_JS = os.path.join(HERE, "world-geo.js")
COUNTS_JS = os.path.join(HERE, "country-counts.js")

# Reference world polygons (source of the baked-in world-geo.js).
WORLD_SRC = "/Users/siyuai/Desktop/githubio/zoeyai.github.io/src/lib/world.json"

# CSV country label -> world.json polygon name (only where they differ).
NAME_MAP = {
    "Democratic Republic of Congo": "Democratic Republic of the Congo",
    "Burma": "Myanmar",
    "Palestine": "West Bank",
    "United Kingdom": "England",
    "Cote d'Ivoire (Ivory Coast)": "Ivory Coast",
    "Serbia": "Republic of Serbia",
}


def load_world():
    if os.path.exists(WORLD_JS):
        # world-geo.js already generated; reuse the source json for names.
        return json.load(open(WORLD_SRC, encoding="utf-8"))
    return json.load(open(WORLD_SRC, encoding="utf-8"))


def main():
    counts = {}
    with open(CSV_PATH, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            v = (row.get("Country of Origin") or "").strip()
            if v and v != "Other":
                counts[v] = counts.get(v, 0) + 1

    world = load_world()
    geo_names = {feat["properties"]["name"] for feat in world["features"]}

    geo_counts = {}
    unmatched = []
    for country, n in counts.items():
        mapped = NAME_MAP.get(country, country)
        if mapped in geo_names:
            geo_counts[mapped] = geo_counts.get(mapped, 0) + n
        else:
            unmatched.append((country, n))

    totals = {"distinct": len(counts), "learners": sum(counts.values())}

    with open(COUNTS_JS, "w", encoding="utf-8") as out:
        out.write("window.LLT_COUNTRY_COUNTS = ")
        json.dump(geo_counts, out, ensure_ascii=False, indent=0, separators=(",", ":"))
        out.write(";\n")
        out.write("window.LLT_COUNTRY_TOTALS = ")
        json.dump(totals, out)
        out.write(";\n")

    if not os.path.exists(WORLD_JS):
        with open(WORLD_JS, "w", encoding="utf-8") as out:
            out.write("window.LLT_WORLD = ")
            json.dump(world, out, separators=(",", ":"))
            out.write(";\n")

    print(f"CSV: {CSV_PATH}")
    print(f"distinct countries (excl. Other): {totals['distinct']}")
    print(f"matched to a polygon: {len(geo_counts)}")
    print(f"learners: {totals['learners']}")
    if unmatched:
        print("unmatched (no polygon, not highlighted):", unmatched)


if __name__ == "__main__":
    main()
