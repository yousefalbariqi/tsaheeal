/* الباقة المخصّصة — ليست حجزاً بل طلب تصميم رحلة.
   لا مقاعد ولا غرف ولا فندق: يجمع رغبة العميل ويتولّى الفريق الباقي.
   الحقول مقسومة كتلتين: الرحلة ثم مقدّم الطلب، وكلٌّ في بطاقة مستقلة. */
import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { B } from "@/lib/theme";
import { BirthDateSelect } from "@/components/BirthDateSelect";
import { SearchSelect } from "@/components/SearchSelect";
import { submitCustomRequest } from "../data";

const G = { deep: "#0B5A41", green: B.primary, gold: B.gold };

const TXT = {
  ar: {
    title: "الباقة المخصّصة", lead: "لم تجد ما يناسبك؟ أخبرنا برحلتك ونجهّز لك العرض ونتواصل معك.",
    tripInfo: "معلومات الرحلة", myInfo: "بياناتك",
    depart: "تاريخ الذهاب", ret: "تاريخ العودة", persons: "عدد المعتمرين",
    dest: "المدينة المطلوبة", room: "نوع السكن المطلوب", hotel: "مستوى الفندق",
    tripNotes: "ملاحظات على الرحلة", notes: "ملاحظات إضافية",
    name: "الاسم", phone: "رقم الجوال", city: "مدينتك",
    namePh: "الاسم الكامل", phonePh: "05XXXXXXXX", cityPh: "مثال: الرياض",
    notesPh: "أي طلب خاص: كرسي متحرك، قرب من الحرم، برنامج معيّن…",
    optional: "اختياري", send: "إرسال الطلب", sending: "جارٍ الإرسال…",
    doneTitle: "وصلنا طلبك", doneMsg: "سيتواصل معك فريقنا لتجهيز العرض المناسب.",
    reqNo: "رقم الطلب", back: "رجوع", home: "الرئيسية",
    required: "هذا الحقل مطلوب", badPhone: "رقم جوال غير صحيح", badDates: "تاريخ العودة قبل الذهاب",
    fillFirst: "أكمل الحقول الناقصة للإرسال",
    pick: "اختر…",
  },
  en: {
    title: "Custom package", lead: "Nothing fits? Tell us about your trip and we'll prepare an offer and contact you.",
    tripInfo: "Trip details", myInfo: "Your details",
    depart: "Departure date", ret: "Return date", persons: "Number of pilgrims",
    dest: "Destination", room: "Preferred room type", hotel: "Hotel level",
    tripNotes: "Trip notes", notes: "Extra notes",
    name: "Name", phone: "Mobile number", city: "Your city",
    namePh: "Full name", phonePh: "05XXXXXXXX", cityPh: "e.g. Riyadh",
    notesPh: "Any special request: wheelchair, close to the Haram, a specific programme…",
    optional: "optional", send: "Send request", sending: "Sending…",
    doneTitle: "Request received", doneMsg: "Our team will contact you with a tailored offer.",
    reqNo: "Request no.", back: "Back", home: "Home",
    required: "This field is required", badPhone: "Invalid mobile number", badDates: "Return is before departure",
    fillFirst: "Complete the missing fields to send",
    pick: "Select…",
  },
} as const;

const DESTS = ["مكة", "مكة والمدينة"];
const ROOMS = ["سكن مشترك", "غرفة خاصة — شخصان", "غرفة خاصة — ٣ أفراد", "غرفة خاصة — ٤ أفراد"];
const LEVELS = ["٣ نجوم", "٤ نجوم", "٥ نجوم", "حسب الأنسب سعراً"];

const validPhone = (p: string) => /^(05\d{8}|(\+?966)5\d{8})$/.test(p.replace(/\s/g, ""));

function Field({ label, error, optional, children }: {
  label: string; error?: string; optional?: string; children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold flex items-center gap-1" style={{ color: B.text3 }}>
        {label}
        {optional
          ? <span className="font-medium" style={{ color: B.muted }}>({optional})</span>
          : <span style={{ color: "#C13515" }}>*</span>}
      </label>
      {children}
      {error && <span className="text-[11px] font-bold" style={{ color: "#C13515" }}>{error}</span>}
    </div>
  );
}

export function CustomRequestScreen({ lang, dir, onDone }: {
  lang: string; dir: "rtl" | "ltr"; onDone: () => void;
}) {
  const x = (TXT as any)[lang] ?? TXT.ar;

  const [departDate, setDepart] = useState("");
  const [returnDate, setReturn] = useState("");
  const [persons, setPersons] = useState(1);
  const [destination, setDest] = useState(DESTS[0]);
  const [roomType, setRoom] = useState("");
  const [hotelLevel, setLevel] = useState("");
  const [tripNotes, setTripNotes] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");

  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reqNo, setReqNo] = useState("");
  const [failed, setFailed] = useState("");

  const err = {
    departDate: !departDate ? x.required : "",
    returnDate: !returnDate ? x.required : returnDate < departDate ? x.badDates : "",
    roomType: !roomType ? x.required : "",
    hotelLevel: !hotelLevel ? x.required : "",
    name: !name.trim() ? x.required : "",
    phone: !phone.trim() ? x.required : !validPhone(phone) ? x.badPhone : "",
    city: !city.trim() ? x.required : "",
  };
  const valid = Object.values(err).every(v => !v);
  const show = (k: keyof typeof err) => (tried ? err[k] : "");

  async function send() {
    setTried(true); setFailed("");
    if (!valid || busy) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setBusy(true);
    try {
      const id = await submitCustomRequest({
        departDate, returnDate, persons, destination, roomType, hotelLevel,
        tripNotes: tripNotes.trim(), name: name.trim(), phone: phone.replace(/\s/g, ""),
        city: city.trim(), notes: notes.trim(),
      });
      setReqNo(id);
    } catch {
      setFailed(x.fillFirst);
    } finally { setBusy(false); }
  }

  const inp = "w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none";
  const ist = (bad?: string) => ({ borderColor: bad ? "#E1A3A3" : B.border, fontFamily: "inherit", background: "#fff" } as const);
  const ltr = { direction: "ltr", textAlign: (dir === "rtl" ? "right" : "left") } as const;
  const card = { background: "#fff", border: `1px solid ${B.border}` };

  if (reqNo) return (
    <div className="px-5 py-10 flex-1 flex flex-col items-center text-center gap-4">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 14 }}
        className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "#E3F3E8" }}>
        <Check size={34} style={{ color: G.green }} />
      </motion.div>
      <div className="font-extrabold text-xl" style={{ color: B.black }}>{x.doneTitle}</div>
      <div className="text-sm" style={{ color: B.text2 }}>{x.doneMsg}</div>
      <div className="rounded-xl px-6 py-3" style={card}>
        <div className="text-xs" style={{ color: B.muted }}>{x.reqNo}</div>
        <div className="font-extrabold text-lg" style={{ color: G.green, fontFamily: "'IBM Plex Mono',monospace" }}>{reqNo}</div>
      </div>
      <button onClick={onDone} className="mt-2 px-6 py-3 rounded-xl font-extrabold text-sm"
        style={{ background: G.gold, color: B.black, border: "none", cursor: "pointer" }}>{x.home}</button>
    </div>
  );

  return (
    <div className="px-4 py-4 flex flex-col gap-4">
      <p className="text-xs" style={{ color: B.muted }}>{x.lead}</p>

      {/* ── معلومات الرحلة ── */}
      <div className="rounded-2xl p-4 flex flex-col gap-4" style={card}>
        <div className="font-extrabold text-sm" style={{ color: G.green }}>{x.tripInfo}</div>

        <Field label={x.depart} error={show("departDate")}>
          <BirthDateSelect lang={lang} dir={dir} value={departDate} onChange={setDepart}
            invalid={!!show("departDate")} future />
        </Field>
        <Field label={x.ret} error={show("returnDate")}>
          <BirthDateSelect lang={lang} dir={dir} value={returnDate} onChange={setReturn}
            invalid={!!show("returnDate")} future />
        </Field>

        <Field label={x.persons}>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setPersons(n => Math.max(1, n - 1))}
              className="w-10 h-10 rounded-full text-lg font-bold cursor-pointer"
              style={{ background: "#fff", border: `1px solid ${B.border}`, color: B.black }}>−</button>
            <span className="text-base font-extrabold" style={{ minWidth: 28, textAlign: "center", color: B.black }}>{persons}</span>
            <button type="button" onClick={() => setPersons(n => Math.min(60, n + 1))}
              className="w-10 h-10 rounded-full text-lg font-bold cursor-pointer"
              style={{ background: "#fff", border: `1px solid ${B.border}`, color: B.black }}>+</button>
          </div>
        </Field>

        <Field label={x.dest}>
          <SearchSelect dir={dir} searchable={false} value={destination} onChange={setDest}
            options={DESTS.map(d => ({ value: d, label: d }))} placeholder={x.pick} />
        </Field>
        <Field label={x.room} error={show("roomType")}>
          <SearchSelect dir={dir} searchable={false} value={roomType} onChange={setRoom} invalid={!!show("roomType")}
            options={ROOMS.map(r => ({ value: r, label: r }))} placeholder={x.pick} />
        </Field>
        <Field label={x.hotel} error={show("hotelLevel")}>
          <SearchSelect dir={dir} searchable={false} value={hotelLevel} onChange={setLevel} invalid={!!show("hotelLevel")}
            options={LEVELS.map(l => ({ value: l, label: l }))} placeholder={x.pick} />
        </Field>
        <Field label={x.tripNotes} optional={x.optional}>
          <textarea value={tripNotes} onChange={e => setTripNotes(e.target.value)} rows={2}
            placeholder={x.notesPh} className={inp} style={{ ...ist(), resize: "vertical" }} />
        </Field>
      </div>

      {/* ── بيانات مقدّم الطلب ── */}
      <div className="rounded-2xl p-4 flex flex-col gap-4" style={card}>
        <div className="font-extrabold text-sm" style={{ color: G.green }}>{x.myInfo}</div>
        <Field label={x.name} error={show("name")}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={x.namePh}
            className={inp} style={ist(show("name"))} />
        </Field>
        <Field label={x.phone} error={show("phone")}>
          <input value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d+ ]/g, ""))}
            inputMode="tel" maxLength={14} placeholder={x.phonePh}
            className={inp} style={{ ...ist(show("phone")), ...ltr }} />
        </Field>
        <Field label={x.city} error={show("city")}>
          <input value={city} onChange={e => setCity(e.target.value)} placeholder={x.cityPh}
            className={inp} style={ist(show("city"))} />
        </Field>
        <Field label={x.notes} optional={x.optional}>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className={inp} style={{ ...ist(), resize: "vertical" }} />
        </Field>
      </div>

      {tried && !valid && (
        <div className="rounded-xl px-4 py-3 text-sm font-bold"
          style={{ background: "#FBE6E6", border: "1px solid #F3C9C9", color: "#BE2626" }}>{x.fillFirst}</div>
      )}
      {failed && (
        <div className="rounded-xl px-4 py-3 text-sm font-bold"
          style={{ background: "#FBE6E6", border: "1px solid #F3C9C9", color: "#BE2626" }}>{failed}</div>
      )}

      <button onClick={send} disabled={busy} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-extrabold text-sm"
        style={{ background: busy ? "#d6cfc6" : G.gold, color: busy ? "#a09688" : B.black, border: "none", cursor: busy ? "not-allowed" : "pointer" }}>
        {busy && <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
          style={{ width: 15, height: 15, border: "2px solid rgba(0,0,0,0.3)", borderTopColor: B.black, borderRadius: "50%", display: "inline-block" }} />}
        {busy ? x.sending : x.send}
      </button>
    </div>
  );
}
