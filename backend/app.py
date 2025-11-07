
import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import requests
from datetime import datetime
from providers import load_hospital_data, find_providers, next_open_slot
from logic import appointment_type, appointment_minutes, insurance_is_accepted, self_pay_rate
from llm import call_llm, LLMNotConfigured
from dotenv import load_dotenv
import json

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_TXT = os.path.join(BASE_DIR, "data_sheet.txt")
FRONTEND_DIST = os.path.join(os.path.dirname(BASE_DIR), "frontend", "dist")

CONTEXT_API_BASE = os.getenv("CONTEXT_API_BASE", "http://localhost:5002")  # patient_api.py default
PATIENT_ID = os.getenv("PATIENT_ID", "1")

app = Flask(__name__, static_folder=FRONTEND_DIST, static_url_path="/")
CORS(app, resources={r"/assist": {"origins": "*"}})  # for Vite dev; safe to tighten later

def get_patient(pid: str):
    url = f"{CONTEXT_API_BASE}/patient/{pid}"
    r = requests.get(url, timeout=5)
    r.raise_for_status()
    return r.json()

@app.post("/assist")
def assist():
    body = request.get_json(force=True) or {}
    msg = (body.get("message") or "").strip()
    pid = str(body.get("patient_id") or PATIENT_ID)

    hospital = load_hospital_data(DATA_TXT)
    accepted = hospital["accepted_insurances"]
    selfpay = hospital["self_pay"]

    patient = get_patient(pid)
    patient_name = patient.get("name")
    patient_dob = patient.get("dob", None)
    patient_ins = patient.get("insurance", None)
    referred = patient.get("referred_providers", [])
    appointments = patient.get("appointments", [])

    # Last completed visits per provider
    completed_by_provider = {}
    for ap in appointments:
        if (ap.get("status") or "").lower() == "completed":
            prov = (ap.get("provider") or "").replace("Dr. ", "").strip()
            completed_by_provider.setdefault(prov, []).append(ap.get("date"))

    today = datetime.now()
    answers = []
    for ref in referred:
        specialty = ref.get("specialty")
        refprov = ref.get("provider")
        candidates = []
        if refprov:
            surname = refprov.split(",")[0]
            candidates = find_providers(hospital, name_contains=surname) or find_providers(hospital, specialty=specialty)
        else:
            candidates = find_providers(hospital, specialty=specialty)
        for p in candidates:
            surname = p["name"].split(",")[0]
            last_completed = None
            for prov, dts in completed_by_provider.items():
                if surname.lower() in prov.lower():
                    try:
                        dts_sorted = sorted(dts, key=lambda s: datetime.strptime(s,"%m/%d/%y"))
                        last_completed = dts_sorted[-1]
                    except Exception:
                        last_completed = dts[-1]
            appt_type = appointment_type(last_completed, today)
            minutes = appointment_minutes(appt_type)
            slot = next_open_slot(p, today, minutes, department_idx=0)
            answers.append({
                "provider": p["name"],
                "certification": p.get("certification"),
                "specialty": p.get("specialty"),
                "department": p.get("departments",[{}])[0].get("name"),
                "address": p.get("departments",[{}])[0].get("address"),
                "phone": p.get("departments",[{}])[0].get("phone"),
                "hours": p.get("departments",[{}])[0].get("hours_raw"),
                "appointment_type": appt_type,
                "suggested_slot": slot.strftime("%Y-%m-%d %H:%M"),
            })

    # Insurance

    # --- Insurance result (tri-state) ---
    if patient_ins and insurance_is_accepted(patient_ins, accepted):
        answers.append({"insurance": patient_ins, "accepted": True})
    elif patient_ins:
        # Insurance present but out of network
        quotes = []
        for ref in referred:
            sp = ref.get("specialty")
            rate = self_pay_rate(sp, selfpay)
            if rate is not None:
                quotes.append({"specialty": sp, "self_pay": rate})
        answers.append({"insurance": patient_ins, "accepted": False, "self_pay_quotes": quotes})
    else:
        # No insurance on file
        answers.append({"insurance": None, "accepted": None, "message": "No insurance on file"})


    system_prompt = (
        "You are a Care Coordinator Assistant for nurses.\n"
        "Use the PATIENT JSON exactly as given (it is the ground truth for this encounter).\n"
        "Scheduling rules to follow in your wording:\n"
        "- Office hours only.\n"
        "- NEW = 30 minutes; ESTABLISHED = 15 minutes (ESTABLISHED if a completed visit with the provider exists within the last 5 years).\n"
        "- Arrivals: NEW arrive 30 min early; ESTABLISHED arrive 10 min early.\n"
        "- If insurance is not accepted, suggest self-pay by specialty.\n"
        "Output a concise, nurse-friendly answer; do not invent data. "
        "If a field is missing from PATIENT, say so plainly."
    )

    # Pass the entire current patient object from the context API
    patient_json = json.dumps(patient, ensure_ascii=False, indent=2)

    user_prompt = (
        f"Nurse message: {msg}\n\n"
        f"PATIENT (from context API):\n```json\n{patient_json}\n```\n\n"
        "Please answer the nurse's question using only the PATIENT data above and the rules."
    )

    try:
        wording = call_llm(system_prompt, user_prompt)
    except LLMNotConfigured as e:
        from flask import abort
        abort(501, description=str(e))        # surfaces an obvious setup error
    except Exception as e:
        from flask import abort
        abort(502, description=f"LLM error: {e}")

    return jsonify({
        "wording": wording,
        "result": {"patient": {"name": patient_name, "dob": patient_dob, "insurance": patient_ins},
                   "intents": "auto",
                   "answers": answers,
                   "actions": []}
    })

# Serve built frontend (production): unknown paths -> index.html
@app.get("/")
def serve_index():
    index_path = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.exists(index_path):
        return send_from_directory(FRONTEND_DIST, "index.html")
    return "Frontend not built. Run `npm run build` in /frontend.", 200

@app.get("/assets/<path:path>")
def serve_assets(path):
    return send_from_directory(os.path.join(FRONTEND_DIST, "assets"), path)

if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", 5050))
    app.run(host="0.0.0.0", port=port)