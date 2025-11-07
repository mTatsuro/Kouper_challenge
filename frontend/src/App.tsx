
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, User2, Stethoscope, Building2, Clock, Phone, MapPin,
  CheckCircle2, XCircle, Loader2, ShieldCheck, Search, CalendarDays
} from "lucide-react";

type ProviderAnswer = {
  provider?: string;
  certification?: string | null;
  specialty?: string | null;
  department?: string | null;
  address?: string | null;
  phone?: string | null;
  hours?: string | null;
  appointment_type?: "NEW" | "ESTABLISHED" | string;
  suggested_slot?: string;
};
type InsuranceAnswer = {
  insurance: string | null;
  accepted: boolean | null;  // was: boolean
  self_pay_quotes?: { specialty: string; self_pay: number }[];
  message?: string;
};
type AssistResult = {
  wording: string;
  result: {
    patient: { name?: string; dob?: string; insurance?: string };
    intents: string;
    answers: (ProviderAnswer | InsuranceAnswer)[];
    actions: any[];
  };
};

const Badge: React.FC<{ tone?: "neutral" | "success" | "danger" | "brand"; children: React.ReactNode }>=({tone="neutral", children})=>{
  const colors: Record<string,string>={
    neutral: "bg-gray-100 text-gray-700",
    success: "bg-green-100 text-green-700",
    danger: "bg-red-100 text-red-700",
    brand: "bg-indigo-100 text-indigo-700",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[tone]}`}>{children}</span>;
};

function MessageBubble({role, text}:{role:"nurse"|"assistant"; text:string}){
  const isUser = role === "nurse";
  return (
    <div className={`flex ${isUser?"justify-end":"justify-start"}`}>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${isUser?"bg-indigo-600 text-white":"bg-white border border-gray-200"}`}>
        {text}
      </div>
    </div>
  );
}

const ProviderCard: React.FC<{ p: ProviderAnswer }>=({p})=>{
  const apptTone = p.appointment_type === "ESTABLISHED" ? "success" : "brand";
  return (
    <motion.div
      layout initial={{opacity:0, y:8}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-8}}
      transition={{type:"spring", stiffness:220, damping:22}}
      className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-indigo-50 flex items-center justify-center">
            <Stethoscope className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <div className="font-semibold text-gray-900">{p.provider}</div>
            <div className="text-sm text-gray-600">{p.certification} • {p.specialty}</div>
          </div>
        </div>
        <Badge tone={apptTone as any}>{p.appointment_type} visit</Badge>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div className="flex items-start gap-2 text-gray-700">
          <Building2 className="h-4 w-4 mt-0.5"/>
          <div>
            <div className="font-medium">{p.department || "Department"}</div>
            {p.address && (<div className="flex items-center gap-1 text-gray-600"><MapPin className="h-3.5 w-3.5"/> {p.address}</div>)}
          </div>
        </div>
        <div className="flex items-start gap-2 text-gray-700">
          <Clock className="h-4 w-4 mt-0.5"/>
          <div>
            <div className="font-medium">Hours</div>
            <div className="text-gray-600">{p.hours || "See office"}</div>
          </div>
        </div>
        <div className="flex items-start gap-2 text-gray-700">
          <Phone className="h-4 w-4 mt-0.5"/>
          <div>
            <div className="font-medium">Contact</div>
            <div className="text-gray-600">{p.phone || "—"}</div>
          </div>
        </div>
      </div>

      {p.suggested_slot && (
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-indigo-50 p-3">
          <div className="flex items-center gap-2 text-indigo-800">
            <CalendarDays className="h-4 w-4"/>
            <span className="text-sm">Suggested next slot:</span>
            <span className="font-medium">{formatSlot(p.suggested_slot)}</span>
          </div>
          <button className="rounded-xl bg-indigo-600 text-white text-sm px-3 py-2 hover:bg-indigo-700">Book</button>
        </div>
      )}
    </motion.div>
  );
};

function formatSlot(s?: string){
  if(!s) return "";
  try {
    const [datePart,timePart] = s.split(" ");
    const iso = `${datePart}T${timePart}:00`;
    const d = new Date(iso);
    return d.toLocaleString([], {weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit"});
  } catch { return s; }
}

export default function App(){
  const [patientId, setPatientId] = useState("1");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<{role:"nurse"|"assistant"; text:string; payload?: AssistResult}[]>([
    { role: "assistant", text: "Hi! Ask me patient and scheduling details. Try: “Give me the patient’s first name, last name, and DOB.” or “Who is the provider for the next appointment?”" }
  ]);

  const answers = useMemo(()=>{
    const last = [...conversation].reverse().find(m=>m.role === "assistant" && (m as any).payload) as any;
    const list = (last?.payload?.result?.answers || []) as (ProviderAnswer | InsuranceAnswer)[];
    const providers: ProviderAnswer[] = list.filter((a:any)=> (a as ProviderAnswer).provider) as ProviderAnswer[];
    const insurance = list.find((a:any)=> (a as InsuranceAnswer).insurance !== undefined) as InsuranceAnswer | undefined;
    return { providers, insurance };
  }, [conversation]);

  const [filterText, setFilterText] = useState("");
  const [filterType, setFilterType] = useState<"ALL"|"NEW"|"ESTABLISHED">("ALL");

  const filteredProviders = useMemo(()=>{
    return (answers.providers || []).filter(p=>{
      const matchesText = !filterText || [p.provider, p.specialty, p.department].join(" ").toLowerCase().includes(filterText.toLowerCase());
      const matchesType = filterType === "ALL" || (p.appointment_type || "").toUpperCase() === filterType;
      return matchesText && matchesType;
    });
  }, [answers.providers, filterText, filterType]);

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{ listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [conversation, busy]);

  async function ask(){
    const content = message.trim();
    if(!content) return;
    setError(null); setBusy(true);
    setConversation(prev=>[...prev, {role:"nurse", text: content}]);

    try{
      const res = await fetch("/assist", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ message: content, patient_id: patientId })
      });
      if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data: AssistResult = await res.json();
      setConversation(prev=>[...prev, {role:"assistant", text: data.wording, payload: data}]);
      setMessage("");
    }catch(e:any){
      console.error(e);
      setError(e?.message || "Request failed");
    }finally{
      setBusy(false);
    }
  }
  function tryPrompt(p: string){ setMessage(p); setTimeout(()=>ask(), 10); }

  const ins = answers.insurance;
  const badgeTone =
  ins?.accepted === true ? "success" :
  ins?.accepted === false ? "danger" : "neutral";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-white/70 bg-white border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-indigo-600 text-white grid place-items-center font-bold">CC</div>
            <div>
              <div className="font-semibold text-gray-900">Care Coordinator Assistant</div>
              <div className="text-sm text-gray-600">Schedule smart. Follow the rules. Be kind to nurses.</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 rounded-2xl border border-gray-300 px-3 py-1.5">
              <User2 className="h-4 w-4 text-gray-600"/>
              <input value={patientId} onChange={e=>setPatientId(e.target.value)} className="w-20 outline-none bg-transparent text-sm" placeholder="Patient ID"/>
            </div>
            <Badge tone="brand"><ShieldCheck className="h-3.5 w-3.5 mr-1 inline"/> HIPAA-safe demo</Badge>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 grid md:grid-cols-5 gap-6">
        <div className="md:col-span-3">
          <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div className="font-medium text-gray-900">Conversation</div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Badge tone="neutral">Rules‑aware</Badge>
                <Badge tone="neutral">LLM phrased</Badge>
              </div>
            </div>
            <div ref={listRef} className="max-h-[58vh] overflow-y-auto p-4 space-y-3">
              {conversation.map((m, idx)=> (<MessageBubble key={idx} role={m.role} text={m.text} />))}
              {busy && (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-2xl bg-white border border-gray-200 px-4 py-2 text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin"/> thinking…
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100">
              <div className="grid grid-cols-1 gap-3">
                <div className="flex items-center gap-2">
                  <div className="hidden md:flex items-center gap-2 rounded-2xl border border-gray-300 px-3 py-2 w-40">
                    <User2 className="h-4 w-4 text-gray-600"/>
                    <input value={patientId} onChange={e=>setPatientId(e.target.value)} className="w-full outline-none bg-transparent text-sm" placeholder="Patient ID"/>
                  </div>
                  <textarea
                    value={message}
                    onChange={(e)=>setMessage(e.target.value)}
                    placeholder="Try: “Give me the patient’s first name, last name, and DOB” or “Who is the provider for the next appointment?”"
                    onKeyDown={(e)=>{ if(e.key === "Enter" && !e.shiftKey){ e.preventDefault(); ask(); } }}
                    className="w-full rounded-2xl border border-gray-300 px-4 py-3 outline-none focus:ring-4 ring-indigo-100 min-h-[84px]"
                  />
                  <button onClick={ask} disabled={busy} className="rounded-2xl bg-indigo-600 text-white px-4 py-3 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
                    <Send className="h-5 w-5"/>
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Give me the patient's first name, last name, and DOB.", "Who is the provider for the next appointment?", "Where is the next appointment located?"
                  ].map((ex)=>(<button key={ex} onClick={()=>tryPrompt(ex)} className="rounded-2xl border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">{ex}</button>))}
                </div>
                {error && (<div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 rounded-2xl px-3 py-2"><XCircle className="h-4 w-4"/> {error}</div>)}
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div className="font-medium text-gray-900">Results</div>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <Badge tone={badgeTone as any}>
                    {ins
                      ? ins.accepted === true
                        ? <span className="inline-flex items-center">
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1"/> {ins.insurance} accepted
                          </span>
                        : ins.accepted === false
                          ? <span className="inline-flex items-center">
                              <XCircle className="h-3.5 w-3.5 mr-1"/> {ins.insurance} not accepted
                            </span>
                          : "Insurance unknown"
                      : "Insurance unknown"
                    }
                  </Badge>
                </div>
            </div>

            <div className="p-4 border-b border-gray-100 flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-2xl border border-gray-300 px-3 py-2 w-full">
                <Search className="h-4 w-4 text-gray-600"/>
                <input onChange={(e)=>setFilterText(e.target.value)} placeholder="Filter by provider, specialty, department" className="w-full outline-none bg-transparent text-sm"/>
              </div>
              <select onChange={(e)=>{/* no-op simple demo */}} className="rounded-2xl border border-gray-300 px-3 py-2 text-sm">
                <option>All types</option><option>New</option><option>Established</option>
              </select>
            </div>

            <div className="p-4 grid grid-cols-1 gap-4">
              <AnimatePresence initial={false}>
                {filteredProviders.length === 0 && (<div className="text-sm text-gray-600">No providers yet — send a prompt to fetch availability.</div>)}
                {filteredProviders.map((p, idx)=> (<ProviderCard key={idx} p={p} />))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      <div className="py-6 text-center text-xs text-gray-500">
        Built with React, Tailwind, and Framer Motion. Connects to your Flask backend at <code>/assist</code>.
      </div>
    </div>
  );
}
