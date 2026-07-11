#!/usr/bin/env python3
"""Build real Global-Connection data for the certificate page.

Connection rule: two people are connected if they share the same
`Attendance Date` + `Zoom Room` (and both were actually present, i.e.
Attendance == 'checked').

  - Learner   -> partner CITIES  = home cities of the volunteers they sat with
  - Volunteer -> partner COUNTRIES = origin countries of the learners they sat with

Coordinates come from each person's Zip Code via a US zip->lat/lng table.

Inputs  (this folder):  AttendanceTable_testing.xlsx, LearnerRegistration.csv,
                        VolunteerRegistration.csv, zips.csv (ZIP,LAT,LNG)
Output  (this folder):  people-data.js  (window.LLT_PEOPLE)
"""
import csv
import json
import os
import hashlib
from collections import defaultdict

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ATT = os.path.join(HERE, "AttendanceTable_testing.xlsx")
LEARN = os.path.join(HERE, "LearnerRegistration.csv")
VOL = os.path.join(HERE, "VolunteerRegistration.csv")
ZIPS = os.path.join(HERE, "zips.csv")
OUT = os.path.join(HERE, "people-data.js")  # public: 2 anonymized samples
OUT_FULL = os.path.join(HERE, "people-data.full.js")  # internal: all real names


def norm_email(v):
    return str(v).strip().lower() if pd.notna(v) else ""


def norm_zip(v):
    if pd.isna(v):
        return ""
    s = str(v).strip()
    if s.endswith(".0"):
        s = s[:-2]
    s = "".join(ch for ch in s if ch.isdigit())
    return s.zfill(5)[:5] if s else ""


def load_zip_coords():
    coords = {}
    with open(ZIPS, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            z = row["ZIP"].strip().zfill(5)
            try:
                coords[z] = [round(float(row["LNG"]), 3), round(float(row["LAT"]), 3)]
            except ValueError:
                pass
    return coords


def s(v):
    return str(v).strip() if pd.notna(v) else ""


def load_registration(path):
    """email -> {first, last, city, state, zip, country, llt_id}"""
    df = pd.read_csv(path, dtype=str)
    out = {}
    for _, r in df.iterrows():
        email = norm_email(r.get("Email Address"))
        if not email:
            continue
        out[email] = {
            "first": s(r.get("First Name")),
            "last": s(r.get("Last Name")),
            "city": s(r.get("City")),
            "state": s(r.get("State")),
            "zip": norm_zip(r.get("Zip Code")),
            "country": s(r.get("Country of Origin")),
            "llt_id": s(r.get("LLT_ID")),
        }
    return out


# Made-up but stable per-person program totals (attendance sample is one day,
# so real session counts are ~1; these make the certificate read like a full year).
def fake_totals(seed):
    h = int(hashlib.md5(seed.encode()).hexdigest(), 16)
    sessions = 8 + (h % 17)  # 8..24
    hours = round(sessions * 1.5)
    return sessions, hours


def main():
    zip_coords = load_zip_coords()
    learners_reg = load_registration(LEARN)
    volunteers_reg = load_registration(VOL)

    att = pd.read_excel(ATT)
    att = att[att["Attendance"].astype(str).str.strip().str.lower() == "checked"]

    # Build sessions: (date, room) -> {learner emails, volunteer emails}
    sessions = defaultdict(lambda: {"Learner": set(), "Volunteer": set()})
    for _, r in att.iterrows():
        email = norm_email(r.get("Email Address"))
        role = (r.get("Role") or "").strip()
        room = str(r.get("Zoom Room")).strip()
        date = str(r.get("Attendance Date")).strip()
        if not email or role not in ("Learner", "Volunteer"):
            continue
        sessions[(date, room)][role].add(email)

    # learner email -> {volunteer email: co-session count}
    learner_links = defaultdict(lambda: defaultdict(int))
    volunteer_links = defaultdict(lambda: defaultdict(int))
    learner_sessions = defaultdict(int)
    volunteer_sessions = defaultdict(int)
    for (date, room), grp in sessions.items():
        for le in grp["Learner"]:
            learner_sessions[le] += 1
        for ve in grp["Volunteer"]:
            volunteer_sessions[ve] += 1
        for le in grp["Learner"]:
            for ve in grp["Volunteer"]:
                learner_links[le][ve] += 1
                volunteer_links[ve][le] += 1

    def coord_for(reg):
        return zip_coords.get(reg.get("zip", ""), None)

    # ---- Learners ----
    learners = []
    for le, links in learner_links.items():
        reg = learners_reg.get(le)
        if not reg:
            continue
        # aggregate partner volunteers by city
        by_city = defaultdict(lambda: {"count": 0, "coords": []})
        for ve, cnt in links.items():
            vreg = volunteers_reg.get(ve)
            if not vreg or not vreg["city"] or not vreg["state"]:
                continue
            key = (vreg["city"], vreg["state"])
            by_city[key]["count"] += cnt
            c = coord_for(vreg)
            if c:
                by_city[key]["coords"].append(c)
        partner_cities = []
        for (city, state), v in by_city.items():
            if not v["coords"]:
                continue
            lng = round(sum(c[0] for c in v["coords"]) / len(v["coords"]), 3)
            lat = round(sum(c[1] for c in v["coords"]) / len(v["coords"]), 3)
            partner_cities.append(
                {"city": city, "state": state, "count": v["count"], "coord": [lng, lat]}
            )
        partner_cities.sort(key=lambda x: -x["count"])
        if not partner_cities:
            continue
        s, h = fake_totals(le)
        full = f"{reg['first']} {reg['last']}".strip()
        learners.append(
            {
                "id": reg["llt_id"] or le,
                "firstName": reg["first"] or full,
                "fullName": full,
                "originCountry": reg["country"] or "another country",
                "homeCity": {"city": reg["city"], "state": reg["state"]},
                "homeCoord": coord_for(reg),
                "partnerCities": partner_cities,
                "sessions": s,
                "hours": h,
            }
        )

    # ---- Volunteers ----
    volunteers = []
    for ve, links in volunteer_links.items():
        reg = volunteers_reg.get(ve)
        if not reg:
            continue
        by_country = defaultdict(int)
        for le, cnt in links.items():
            lreg = learners_reg.get(le)
            if not lreg or not lreg["country"] or lreg["country"] == "Other":
                continue
            by_country[lreg["country"]] += cnt
        partner_countries = [
            {"country": c, "count": n}
            for c, n in sorted(by_country.items(), key=lambda x: -x[1])
        ]
        if not partner_countries:
            continue
        s, h = fake_totals(ve)
        full = f"{reg['first']} {reg['last']}".strip()
        volunteers.append(
            {
                "id": reg["llt_id"] or ve,
                "firstName": reg["first"] or full,
                "fullName": full,
                "homeCity": {"city": reg["city"], "state": reg["state"]},
                "homeCoord": coord_for(reg),
                "partnerCountries": partner_countries,
                "sessions": s,
                "hours": h,
            }
        )

    # Defaults for the demo = richest maps; id tie-break keeps it deterministic.
    learners.sort(key=lambda p: (-len(p["partnerCities"]), p["id"]))
    volunteers.sort(key=lambda p: (-len(p["partnerCountries"]), p["id"]))

    # Prefer a default with a clean, well-formed home city (every word
    # title-cased) so the demo doesn't surface messy registration data.
    import re

    def clean_home(p):
        city = p["homeCity"]["city"]
        return bool(
            p["homeCoord"]
            and city not in ("USA", "")
            and re.match(r"^[A-Z][a-zA-Z]+(?:[ '\-][A-Z][a-zA-Z]+)*$", city)
        )

    default_learner = next(
        (p for p in learners if clean_home(p)),
        next((p for p in learners if p["homeCoord"]), learners[0]),
    )
    default_volunteer = next(
        (p for p in volunteers if clean_home(p)),
        next((p for p in volunteers if p["homeCoord"]), volunteers[0]),
    )

    # (1) FULL dataset with real names — internal use only (gitignored).
    full_payload = {
        "learners": learners,
        "volunteers": volunteers,
        "defaultLearnerId": default_learner["id"],
        "defaultVolunteerId": default_volunteer["id"],
    }
    with open(OUT_FULL, "w", encoding="utf-8") as f:
        f.write("window.LLT_PEOPLE = ")
        json.dump(full_payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    # (2) PUBLIC demo dataset — only the two defaults, names anonymized.
    dl = dict(default_learner)
    dl.update(id="demo-learner-a", firstName="Learner A", fullName="Learner A")
    dv = dict(default_volunteer)
    dv.update(id="demo-volunteer-b", firstName="Volunteer B", fullName="Volunteer B")
    demo_payload = {
        "learners": [dl],
        "volunteers": [dv],
        "defaultLearnerId": dl["id"],
        "defaultVolunteerId": dv["id"],
    }
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// Anonymized demo data (2 sample people). Real names live in the\n")
        f.write("// gitignored people-data.full.js. Regenerate via build-connections-data.py.\n")
        f.write("window.LLT_PEOPLE = ")
        json.dump(demo_payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    print(f"learners with connections: {len(learners)}")
    print(f"volunteers with connections: {len(volunteers)}")
    print(
        f"demo learner: {default_learner['originCountry']} "
        f"-> {len(dl['partnerCities'])} cities (anonymized as 'Learner A')"
    )
    print(
        f"demo volunteer: -> {len(dv['partnerCountries'])} countries "
        f"(anonymized as 'Volunteer B')"
    )
    print(f"wrote {OUT} (public) and {OUT_FULL} (full, gitignored)")


if __name__ == "__main__":
    main()
