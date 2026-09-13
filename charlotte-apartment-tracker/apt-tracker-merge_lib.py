"""
Merge library for the Charlotte apartment tracker pipeline.
merge(current, researched, today) -> new_data

`current`: the dict extracted from the live artifact's window.__APP_DATA__
           (has properties[].bonus.<key>.{v,o}, myNote, toured (bool), units[].tags.<key>.{v,o},
           afterVisit, hidden, favorite -- i.e. Marcy's self-edits are already baked into the
           o/myNote/toured/afterVisit/hidden/favorite fields; this module never sets these from
           `researched`, it only carries them forward unchanged).

`researched`: {
  "properties": {
    "<Property Name>": {                 # keyed exactly as it appears in `current`
      # only include keys actually re-researched this cycle; omitted keys are carried forward unchanged
      "address": str, "station": str, "walkMin": str, "walkRating": str,
      "year": str, "ageOk": str, "gRating": str, "gReviews": str, "url": str,
      "notes": str,                      # plain research-notes text, only if re-researched
      "bonus": {"parking": "Yes"/"No"/"Unclear ...", "locker": ..., "gym": ..., "wifi": ..., "trash": ...},
      "units": [                         # ALL units confirmed available THIS cycle (omit = none available)
        {"unit": str, "sqft": num/str, "price": num/str, "wd": "Yes"/"No",
         "closet": "Yes"/"No"/"Unclear ...", "den": "", "balcony": "", "source": str}
      ],
      "unreachable": bool                # True if the site could not be checked this cycle
    }
  },
  "new_properties": {                    # properties found this cycle that are NOT already in `current`
    "<New Property Name>": {             # same shape as above, ALL base fields required (nothing to carry forward)
      "address": str, "station": str, "walkMin": str, "walkRating": str,
      "year": str, "ageOk": str, "gRating": "", "gReviews": "", "url": str, "notes": str,
      "bonus": {...}, "units": [...]
    }
  }
}
`today`: "YYYY-MM-DD" string.
"""
import copy


def _field(v, o=None):
    return {"v": v, "o": o}


def _sqft_ok(sqft):
    try:
        return "Yes" if float(str(sqft).replace(",", "")) >= 735 else "No"
    except (ValueError, TypeError):
        return "No"


def _price_ok(price):
    if price in (None, ""):
        return "N/A"
    try:
        return "Yes" if float(str(price).replace(",", "").replace("$", "")) <= 2000 else "No"
    except (ValueError, TypeError):
        return "N/A"


def _overall(sqft_ok, price_ok, walk_min, age_ok, wd_v):
    try:
        walk_ok = float(str(walk_min).replace(",", "")) <= 15
    except (ValueError, TypeError):
        walk_ok = False
    wd_yes = str(wd_v).strip().lower().startswith("yes")
    if sqft_ok == "Yes" and price_ok in ("Yes", "N/A") and walk_ok and age_ok == "Yes" and wd_yes:
        return "PASS"
    if sqft_ok == "No" or age_ok == "No" or not walk_ok or price_ok == "No":
        return "FAIL - see notes"
    return "REVIEW"


def _normalize(val):
    v = str(val or "").strip().lower()
    if v.startswith("yes"):
        return "Yes"
    if v.startswith("no"):
        return "No"
    return "Unclear"


def _merge_bonus(cur_bonus, new_v_map):
    out = {}
    for key in ("parking", "locker", "gym", "wifi", "trash"):
        cur = cur_bonus.get(key, _field("")) if cur_bonus else _field("")
        v = new_v_map.get(key, cur.get("v", "")) if new_v_map else cur.get("v", "")
        o = cur.get("o")
        if o is not None and _normalize(o) == _normalize(v):
            o = None  # override now matches freshly-researched value; no need to keep it flagged
        out[key] = _field(v, o)
    return out


def _merge_tags(cur_tags, new_unit):
    out = {}
    for key in ("wd", "den", "balcony", "closet"):
        cur = cur_tags.get(key, _field("")) if cur_tags else _field("")
        # only overwrite v if the researched unit actually supplied a non-empty value for this key
        new_v = new_unit.get(key, "")
        v = new_v if new_v not in (None, "") else cur.get("v", "")
        o = cur.get("o")
        if o is not None and v != "" and _normalize(o) == _normalize(v):
            o = None
        out[key] = _field(v, o)
    return out


def _new_property_shell(name, spec):
    return {
        "name": name,
        "url": spec.get("url", ""),
        "address": spec.get("address", ""),
        "station": spec.get("station", ""),
        "walkMin": spec.get("walkMin", ""),
        "walkRating": spec.get("walkRating", ""),
        "year": spec.get("year", ""),
        "ageOk": spec.get("ageOk", ""),
        "gRating": spec.get("gRating", ""),
        "gReviews": spec.get("gReviews", ""),
        "bonus": _merge_bonus({}, spec.get("bonus", {})),
        "notes": spec.get("notes", ""),
        "myNote": "",
        "toured": False,
        "hidden": False,
        "units": [],
    }


def merge(current, researched, today, next_id_start=None):
    cur_by_name = {p["name"]: p for p in current.get("properties", [])}
    researched_props = researched.get("properties", {})
    new_props_spec = researched.get("new_properties", {})

    # figure out a safe next unit id (ids must stay unique/stable across the whole doc)
    max_id = -1
    for p in current.get("properties", []):
        for u in p.get("units", []):
            if isinstance(u.get("id"), int):
                max_id = max(max_id, u["id"])
    next_id = (max_id + 1) if next_id_start is None else next_id_start

    merged_props = []

    for name, cur_p in cur_by_name.items():
        r = researched_props.get(name)
        if r is None:
            # not touched this cycle at all (shouldn't normally happen if all 24+ are always
            # re-checked, but if a property is skipped, carry it forward completely untouched)
            untouched = copy.deepcopy(cur_p)
            untouched.setdefault("toured", False)
            untouched.setdefault("hidden", False)
            merged_props.append(untouched)
            continue

        new_p = copy.deepcopy(cur_p)
        new_p.setdefault("toured", False)
        new_p.setdefault("hidden", False)
        for simple_key in ("address", "station", "walkMin", "walkRating", "year", "ageOk",
                           "gRating", "gReviews", "url"):
            if simple_key in r:
                new_p[simple_key] = r[simple_key]
        if "notes" in r:
            if r.get("unreachable"):
                tag = "[本轮无法访问官网核实，以下为上次研究结果] "
                if not new_p["notes"].startswith("[本轮无法访问"):
                    new_p["notes"] = tag + new_p["notes"]
            else:
                new_p["notes"] = r["notes"]
        new_p["bonus"] = _merge_bonus(cur_p.get("bonus", {}), r.get("bonus", {}))

        # --- units ---
        cur_units_by_code = {u["unit"]: u for u in cur_p.get("units", [])}
        researched_units = r.get("units", [])
        researched_codes = {u["unit"] for u in researched_units}

        new_units = []
        for ru in researched_units:
            code = ru["unit"]
            cur_u = cur_units_by_code.get(code)
            sqft_ok = _sqft_ok(ru.get("sqft"))
            price_ok = _price_ok(ru.get("price"))
            overall = _overall(sqft_ok, price_ok, new_p.get("walkMin"), new_p.get("ageOk"), ru.get("wd", cur_u["tags"]["wd"]["v"] if cur_u else ""))
            if cur_u:
                merged_unit = copy.deepcopy(cur_u)
                merged_unit["sqft"] = ru.get("sqft", cur_u["sqft"])
                merged_unit["price"] = ru.get("price", cur_u["price"])
                merged_unit["sqftOk"] = sqft_ok
                merged_unit["priceOk"] = price_ok
                merged_unit["overall"] = overall
                if "source" in ru:
                    merged_unit["source"] = ru["source"]
                merged_unit["tags"] = _merge_tags(cur_u.get("tags", {}), ru)
            else:
                merged_unit = {
                    "id": next_id,
                    "unit": code,
                    "sqft": ru.get("sqft", ""),
                    "sqftOk": sqft_ok,
                    "price": ru.get("price", ""),
                    "priceOk": price_ok,
                    "overall": overall,
                    "source": ru.get("source", "New search (%s)" % today),
                    "tags": _merge_tags({}, ru),
                    "afterVisit": "",
                }
                next_id += 1
            new_units.append(merged_unit)

        # units that disappeared this cycle: drop UNLESS Marcy left personal data on them,
        # in which case keep them but mark clearly as no longer available
        for code, cur_u in cur_units_by_code.items():
            if code in researched_codes:
                continue
            has_personal = bool((cur_u.get("afterVisit") or "").strip()) or any(
                (cur_u.get("tags", {}).get(k) or {}).get("o") is not None
                for k in ("wd", "den", "balcony", "closet")
            )
            if has_personal:
                kept = copy.deepcopy(cur_u)
                if not str(kept.get("overall", "")).startswith("UNAVAILABLE"):
                    kept["overall"] = "UNAVAILABLE (曾在租，现已下架 - 你的笔记已保留)"
                new_units.append(kept)
            # else: silently dropped (no longer available, nothing personal to lose)

        new_p["units"] = new_units
        merged_props.append(new_p)

    # brand-new properties discovered this cycle
    for name, spec in new_props_spec.items():
        if name in cur_by_name:
            continue  # safety: don't duplicate if it actually already existed
        p = _new_property_shell(name, spec)
        for ru in spec.get("units", []):
            sqft_ok = _sqft_ok(ru.get("sqft"))
            price_ok = _price_ok(ru.get("price"))
            overall = _overall(sqft_ok, price_ok, p.get("walkMin"), p.get("ageOk"), ru.get("wd", ""))
            p["units"].append({
                "id": next_id,
                "unit": ru["unit"],
                "sqft": ru.get("sqft", ""),
                "sqftOk": sqft_ok,
                "price": ru.get("price", ""),
                "priceOk": price_ok,
                "overall": overall,
                "source": ru.get("source", "New search (%s)" % today),
                "tags": _merge_tags({}, ru),
                "afterVisit": "",
            })
            next_id += 1
        merged_props.append(p)

    return {"updatedAt": today, "properties": merged_props}
