
import re
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from pathlib import Path

WEEKDAY_MAP = {"M":0,"Tu":1,"W":2,"Th":3,"F":4,"Sa":5,"Su":6}

def _to24(h:int, ap:str)->int:
    ap = ap.lower()
    if ap=="am":
        return 0 if h==12 else h
    else:
        return 12 if h==12 else h+12

def _parse_hours(hours_str: str) -> List[Dict[str, Any]]:
    hours_str = hours_str.strip()
    m = re.match(r'([A-Za-z]{1,2})(?:-([A-Za-z]{1,2}))?\s+(\d{1,2})(am|pm)-(\d{1,2})(am|pm)', hours_str)
    if not m:
        return []
    sd, ed, sh, sap, eh, eap = m.groups()
    sh, eh = int(sh), int(eh)
    start_hour = _to24(sh, sap)
    end_hour = _to24(eh, eap)
    si = WEEKDAY_MAP[sd]
    ei = WEEKDAY_MAP.get(ed, si)
    days = []
    if ed is None or ei == si:
        days = [si]
    else:
        i = si
        while True:
            days.append(i)
            if i==ei: break
            i=(i+1)%7
    return [{"weekday": d, "start": start_hour, "end": end_hour} for d in days]

def load_hospital_data(txt_path: str) -> Dict[str, Any]:
    text = Path(txt_path).read_text(encoding="utf-8")
    lines = [ln.rstrip() for ln in text.splitlines() if ln.strip()]
    providers: List[Dict[str, Any]] = []
    accepted_insurances: List[str] = []
    self_pay: Dict[str, float] = {}
    i = 0
    section = None
    current_provider = None

    while i < len(lines):
        line = lines[i]

        if line.strip() == "Provider Directory":
            section = "providers"; i += 1; continue
        if line.strip().startswith("Appointments:"):
            section = "appointments_meta"; i += 1; continue
        if line.strip().startswith("Accepted Insurances:"):
            section = "insurances"; i += 1; continue
        if line.strip().startswith("Self-pay:"):
            section = "selfpay"; i += 1; continue

        if section == "providers":
            if line.startswith("- "):  # new provider
                if current_provider:
                    providers.append(current_provider)
                name = line[2:].strip()
                current_provider = {"name": name, "certification": None, "specialty": None, "departments": []}
            elif "certification:" in line:
                current_provider["certification"] = line.split("certification:",1)[1].strip()
            elif "specialty:" in line:
                current_provider["specialty"] = line.split("specialty:",1)[1].strip()
            elif line.strip().startswith("- department:") or line.strip().startswith("department:"):
                dept = {}
                j = i + 1
                while j < len(lines) and any(lines[j].strip().startswith(prefix) for prefix in ("- name", "name", "- phone","phone","- address","address","- hours","hours")):
                    ln = lines[j].strip().lstrip("- ").strip()
                    if ln.startswith("name:"): dept["name"] = ln.split("name:",1)[1].strip()
                    elif ln.startswith("phone:"): dept["phone"] = ln.split("phone:",1)[1].strip()
                    elif ln.startswith("address:"): dept["address"] = ln.split("address:",1)[1].strip()
                    elif ln.startswith("hours:"):
                        dept["hours_raw"] = ln.split("hours:",1)[1].strip()
                        dept["hours"] = _parse_hours(dept["hours_raw"])
                    j += 1
                current_provider["departments"].append(dept)
                i = j - 1
        elif section == "insurances":
            if line.startswith("- "):
                accepted_insurances.append(line[2:].strip())
        elif section == "selfpay":
            if line.startswith("- "):
                rest = line[2:].strip()
                if ":" in rest and "$" in rest:
                    spec, price = rest.split(":", 1)
                    try:
                        price = float(price.replace("$", "").strip())
                        self_pay[spec.strip()] = price
                    except: pass
        i += 1

    if current_provider:
        providers.append(current_provider)

    return {"providers": providers, "accepted_insurances": accepted_insurances, "self_pay": self_pay}

def find_providers(data: Dict[str, Any], specialty: Optional[str]=None, name_contains: Optional[str]=None) -> List[Dict[str, Any]]:
    out = []
    for p in data["providers"]:
        if specialty and (p.get("specialty") or "").lower() != specialty.lower():
            continue
        if name_contains and name_contains.lower() not in p["name"].lower():
            continue
        out.append(p)
    return out

def provider_is_open_on(p: Dict[str, Any], dt: datetime, department_idx: int = 0) -> bool:
    depts = p.get("departments") or []
    if not depts: return False
    dept = depts[department_idx]
    for rule in dept.get("hours", []):
        if rule["weekday"] == dt.weekday() and rule["start"] <= dt.hour < rule["end"]:
            return True
    return False

def next_open_slot(p: Dict[str, Any], dt: datetime, appt_minutes: int, department_idx: int = 0) -> datetime:
    from datetime import timedelta
    cur = dt.replace(minute=0, second=0, microsecond=0)
    cur += timedelta(minutes=30 if dt.minute < 30 else 60)
    attempts = 0
    while attempts < 7*24*2:  # up to a week ahead in 30m steps
        if provider_is_open_on(p, cur, department_idx):
            return cur
        cur += timedelta(minutes=30)
        attempts += 1
    return dt
