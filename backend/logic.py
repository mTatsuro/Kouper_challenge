
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List

APPT_MINUTES = {"NEW": 30, "ESTABLISHED": 15}

def is_established(last_completed_visit_date: Optional[str], today: Optional[datetime] = None) -> bool:
    today = today or datetime.now()
    if not last_completed_visit_date:
        return False
    for fmt in ("%m/%d/%y", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(last_completed_visit_date, fmt)
            return (today - dt) <= timedelta(days=5*365)
        except ValueError:
            continue
    return False

def appointment_type(last_completed_visit_date: Optional[str], today: Optional[datetime] = None) -> str:
    return "ESTABLISHED" if is_established(last_completed_visit_date, today) else "NEW"

def appointment_minutes(appt_type: str) -> int:
    return APPT_MINUTES.get((appt_type or '').upper(), 30)

def insurance_is_accepted(patient_ins: Optional[str], accepted: List[str]) -> bool:
    if not patient_ins: return False
    return any(patient_ins.lower() == a.lower() for a in accepted)

def self_pay_rate(specialty: str, self_pay_map: Dict[str, float]) -> Optional[float]:
    for k, v in self_pay_map.items():
        if k.lower() == specialty.lower():
            return v
    return None
