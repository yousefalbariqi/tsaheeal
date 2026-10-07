/* صفحة «حسابي» — الهوية والبيانات ودفتر المسافرين.

   بُنيت على نظام صفحة المستفيد (C/T/R وكِت الواجهة) لا على ثيمة لوحة
   الموظف: الصفحة القديمة كانت بطاقة خضراء متدرّجة وأزرار B، فبدت من
   تطبيق آخر بمجرّد الانتقال إليها من الاستكشاف.

   البنية صفوف قراءة أولاً والتحرير في أوراق سفلية: الصفحة تُقرأ في نظرة
   ولا تتحوّل إلى نموذج طويل، والتعديل يبقى مقصوداً لا عرضياً. */
import { useEffect, useState } from "react";
import {
  ChevronLeft, Plus, Pencil, Trash2, Check, LogOut, Globe, Ticket, UserRound, Users,
  CircleAlert, BadgeCheck, BookUser,
} from "lucide-react";
import { toast } from "sonner";
import { fmtDate } from "@/lib/dates";
import { C, T, SPACE, LTR, flipRTL } from "../ui/tokens";
import { Sheet, CTAButton, GrayButton, useDir } from "../ui/kit";
import { InputStack, StackField, PhoneField, Labeled } from "../ui/FlowScreen";
import { BirthDateSelect } from "@/components/BirthDateSelect";
import { NationalitySelect } from "@/components/NationalitySelect";
import { SearchSelect } from "@/components/SearchSelect";
import { DOC_TYPES, docTypeDef, docText, type DocType } from "@/data/docTypes";
import { Spinner } from "@/components/Spinner";
import type { CustomerSession } from "../customerAuth";
import {
  requestPhoneChange, confirmPhoneChange, changePhoneNoOtp, SKIP_OTP, saveProfile, isFail, authErrorMessage,
} from "../customerAuth";
import {
  fetchTravellers, saveTraveller, deleteTraveller, emptyTraveller, type Traveller,
} from "../travellers";
import { LANGS, type Lang } from "../i18n";

/* الصفر الأول اختياري: الحقل يعرض «+966» ويقترح «5X XXX XXXX»، فمن كتب كما
   يُقترح عليه كان يبقى زرّه معطّلاً. مطابقٌ لتحقّق شاشة الحجز وللخادم. */
const validPhone = (p: string) => /^(0?5\d{8}|(\+?966)5\d{8})$/.test(p.replace(/\s/g, ""));
const validName  = (s: string) => s.trim().split(/\s+/).filter(Boolean).length >= 2 && s.trim().length >= 5;
const initial = (s: string) => s.trim().charAt(0) || "؟";

/* تاريخ الميلاد كان يُعرض كما يُخزَّن («1990-04-12»). العربية من lib/dates،
   والإنجليزية بالتقويم الميلادي نفسه وأرقامٍ لاتينية. */
const enDate = new Intl.DateTimeFormat("en-GB-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" });
function dateText(iso: string, lang: string): string {
  if (lang !== "en") return fmtDate(iso);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? enDate.format(new Date(+m[1], +m[2] - 1, +m[3], 12)) : iso;
}

/* ما يرميه حفظ المعتمر نصٌّ للمطوّر (`auth_required` أو رسالة PostgREST)؛
   يُسجَّل في الطرفية ويُقال للعميل ما يفعله. النصّان هنا لا في i18n.ts
   لأن الملف ليس من ملفّات هذه الشاشة. */
function travellerSaveError(e: unknown, lang: string): string {
  console.error("[Account] تعذّر حفظ المعتمر:", e);
  const raw = String((e as { message?: string })?.message ?? "");
  const en = lang === "en";
  if (raw === "auth_required" || /jwt|not authenticated|401/i.test(raw)) {
    return en ? "Your session has ended. Sign in again, then save."
              : "انتهت جلستك. سجّل الدخول من جديد ثم أعد الحفظ.";
  }
  return en ? "We couldn't save the details. Check your connection and try again."
            : "تعذّر حفظ البيانات. تحقّق من الاتصال ثم حاول مرة أخرى.";
}

/* ── لبنات العرض ─────────────────────────────────────────────────── */

function SectionCard({ title, action, children }: {
  title: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="ac-section">
      <div className="ac-section-head">
        <h2>{title}</h2>
        {action}
      </div>
      <div className="ac-card">{children}</div>
    </section>
  );
}

/** إجراء القسم — نصٌّ ذهبيٌّ هادئ بمساحة لمس ٤٤. الزرّ ذو الإطار الأسود
    كان أثقل من عنوان القسم نفسه، وثلاثةٌ منه في الصفحة تتنازع النظر. */
function LinkAction({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" className="ac-link" onClick={onClick}>{children}</button>;
}

/** صفّ «تسمية ← قيمة» مع إجراء اختياري على الحافّة. */
function Row({ label, value, action, empty }: {
  label: string; value: React.ReactNode; action?: React.ReactNode;
  /** قيمة غير مدخلة — تُخفَّت حتى لا تُقرأ «غير محدّد» كأنها بيان. */
  empty?: boolean;
}) {
  return (
    <div className="ac-row">
      <span className="ac-row-label">{label}</span>
      <span className="ac-row-value" data-empty={empty ? "" : undefined}>
        <span>{value}</span>
        {action}
      </span>
    </div>
  );
}

function NavRow({ icon, label, onClick }: {
  icon: React.ReactNode; label: string; onClick: () => void;
}) {
  const dir = useDir();
  return (
    <button type="button" onClick={onClick} className="ac-nav">
      {icon}
      <span>{label}</span>
      <ChevronLeft size={18} style={flipRTL(dir)} />
    </button>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return <div className="ac-error" role="alert"><CircleAlert size={16} aria-hidden /><span>{children}</span></div>;
}

/** دوّارة داخل الزرّ الذهبي — حبرٌ على ذهب لا أبيض (كانت لا تُرى). */
const BtnSpinner = () => <Spinner size={15} />;

/* ── الصفحة ──────────────────────────────────────────────────────── */

export interface AccountProps {
  session: CustomerSession | null;
  onSession: (s: CustomerSession) => void;
  lang: Lang; setLang: (l: Lang) => void;
  t: (k: string) => string;
  onLogin: () => void;
  onLogout: () => void;
  onBookings: () => void;
}

export function Account(p: AccountProps) {
  const { session, t, lang } = p;
  const dir = useDir();

  const [travellers, setTravellers] = useState<Traveller[]>([]);
  const [loadingTr, setLoadingTr] = useState(false);

  useEffect(() => {
    if (!session) { setTravellers([]); return; }
    let alive = true;
    setLoadingTr(true);
    fetchTravellers()
      .then(rows => { if (alive) setTravellers(rows); })
      .finally(() => { if (alive) setLoadingTr(false); });
    return () => { alive = false; };
  }, [session?.userId]);

  /* رسالة نجاح قصيرة بدل ورقة تأكيد: الحفظ نجح والصفحة تُظهر أثره سلفاً.
     عبر Toaster التطبيق (sonner) لا شريطٍ محلي — كان للصفحة توستٌ ثانٍ
     بشكلٍ وموضعٍ يخالفان بقية الشاشات. */
  const flash = (m: string) => { toast.success(m); };

  const fullName = [session?.profile?.firstName, session?.profile?.lastName].filter(Boolean).join(" ");

  if (!session) {
    const en = lang === "en";
    return (
      <div className="ac-guest">
        <span className="ac-guest-mark" aria-hidden><UserRound size={36} strokeWidth={1.6} /></span>
        <h1>{t("guestAccount")}</h1>
        <p>{t("guestAccountHint")}</p>
        <ul className="ac-guest-list">
          <li><span aria-hidden><Ticket size={18} /></span>{en ? "Follow your bookings and tickets" : "تابع حجوزاتك وتذاكرك"}</li>
          <li><span aria-hidden><Users size={18} /></span>{en ? "Save pilgrims' details for next time" : "احفظ بيانات المعتمرين للمرة القادمة"}</li>
        </ul>
        <div className="ac-guest-cta">
          <CTAButton full onClick={p.onLogin}>{t("login")}</CTAButton>
        </div>
      </div>
    );
  }

  return (
    <div className="ts-account-shell flex-1 flex flex-col" style={{ padding: SPACE.page, gap: 24 }}>
      {/* ── الهوية ── */}
      <div className="ac-id">
        <span className="ac-avatar" data-size="lg" aria-hidden>{initial(fullName || session.phoneLocal)}</span>
        <div className="min-w-0">
          <div className="ac-id-name">{fullName || t("notSet")}</div>
          <div className="ac-id-meta">
            <span style={LTR}>{session.phoneLocal}</span>
            <span className="ac-badge"><BadgeCheck size={13} />{t("verifiedBadge")}</span>
          </div>
        </div>
      </div>

      <ProfileSection {...p} onSaved={m => flash(m)} />

      <TravellersSection
        t={t} lang={lang} dir={dir} rows={travellers} loading={loadingTr}
        onChange={setTravellers} onFlash={flash}
      />

      <SectionCard title={t("settings")}>
        <NavRow icon={<Ticket size={19} />} label={t("myBookings")} onClick={p.onBookings} />
        <div className="ac-lang">
          <div className="ac-lang-head">
            <Globe size={19} />
            <span>{t("language")}</span>
          </div>
          <div className="ac-seg" role="radiogroup" aria-label={t("language")}>
            {LANGS.map(l => {
              const on = lang === l.code;
              return (
                <button key={l.code} type="button" role="radio" aria-checked={on}
                  data-on={on ? "" : undefined} onClick={() => p.setLang(l.code)}>
                  {on && <Check size={15} strokeWidth={2.6} aria-hidden />}
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>
      </SectionCard>

      <button type="button" onClick={p.onLogout} className="ac-logout">
        <LogOut size={17} />{t("logout")}
      </button>
    </div>
  );
}

/* ── بياناتي ─────────────────────────────────────────────────────── */

function ProfileSection({ session, onSession, t, lang, onSaved }:
  AccountProps & { onSaved: (m: string) => void }) {
  const dir = useDir();
  const [open, setOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);

  const pr = session!.profile;
  const [first, setFirst] = useState(pr?.firstName ?? "");
  const [last,  setLast]  = useState(pr?.lastName ?? "");
  const [birth, setBirth] = useState(pr?.birthDate ?? "");
  const [email, setEmail] = useState(pr?.email ?? "");
  const [tried, setTried] = useState(false);
  const [busy,  setBusy]  = useState(false);
  const [err,   setErr]   = useState("");

  /* إعادة التعبئة عند كل فتح: إغلاق الورقة بلا حفظ يجب ألّا يترك
     المسوّدة معلّقة إلى الفتحة التالية. */
  const openSheet = () => {
    setFirst(pr?.firstName ?? ""); setLast(pr?.lastName ?? "");
    setBirth(pr?.birthDate ?? ""); setEmail(pr?.email ?? "");
    setTried(false); setErr(""); setOpen(true);
  };

  const valid = !!first.trim() && !!last.trim() && !!birth;

  async function submit() {
    setTried(true); setErr("");
    if (!valid || busy) return;
    setBusy(true);
    const r = await saveProfile({ firstName: first, lastName: last, birthDate: birth, email });
    setBusy(false);
    if (isFail(r)) { setErr(authErrorMessage(r, t)); return; }
    onSession({ ...session!, profile: r.profile });
    setOpen(false);
    onSaved(t("accountSaved"));
  }

  const legalName = [pr?.firstName, pr?.lastName].filter(Boolean).join(" ");

  return (
    <>
      <SectionCard
        title={t("myDetails")}
        action={<LinkAction onClick={openSheet}><Pencil size={15} />{t("editDetails")}</LinkAction>}>
        <Row label={t("legalName")} empty={!legalName} value={legalName || t("notSet")} />
        <Row label={t("birthDate")} empty={!pr?.birthDate}
          value={pr?.birthDate ? dateText(pr.birthDate, lang) : t("notSet")} />
        <Row label={t("email")} empty={!pr?.email}
          value={pr?.email ? <span style={LTR}>{pr.email}</span> : t("notSet")} />
        <Row
          label={t("phone")}
          value={<span style={LTR}>{session!.phoneLocal}</span>}
          action={<LinkAction onClick={() => setPhoneOpen(true)}>{t("changePhone")}</LinkAction>}
        />
      </SectionCard>

      <Sheet open={open} onClose={() => setOpen(false)} title={t("editDetails")}
        footer={
          <CTAButton full onClick={submit} disabled={busy || !valid}>
            {busy ? <BtnSpinner /> : null}
            {t("save")}
          </CTAButton>
        }>
        <div className="flex flex-col" style={{ gap: 16 }}>
          <Labeled label={t("legalName")}>
            <InputStack>
              <StackField label={t("firstName")} value={first} onChange={setFirst}
                error={tried && !first.trim() ? " " : undefined} />
              <StackField label={t("lastName")} value={last} onChange={setLast} last
                error={tried && !last.trim() ? " " : undefined} />
            </InputStack>
          </Labeled>
          <Labeled label={t("birthDate")} hint={tried && !birth ? t("required") : undefined} bad={tried && !birth}>
            <BirthDateSelect lang={lang} dir={dir} value={birth} invalid={tried && !birth} onChange={setBirth} />
          </Labeled>
          <Labeled label={t("emailOptional")}>
            <InputStack>
              <StackField label={t("email")} value={email} onChange={setEmail} last ltr
                type="email" inputMode="email" placeholder="name@example.com" />
            </InputStack>
          </Labeled>
          {err && <ErrorNote>{err}</ErrorNote>}
        </div>
      </Sheet>

      <PhoneChangeSheet open={phoneOpen} onClose={() => setPhoneOpen(false)}
        session={session!} onSession={onSession} t={t} onDone={() => onSaved(t("phoneChanged"))} />
    </>
  );
}

/* ── تغيير الجوال: رقم ثم رمز ────────────────────────────────────── */

function PhoneChangeSheet({ open, onClose, session, onSession, t, onDone }: {
  open: boolean; onClose: () => void; session: CustomerSession;
  onSession: (s: CustomerSession) => void; t: (k: string) => string; onDone: () => void;
}) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) { setStep("phone"); setPhone(""); setCode(""); setErr(""); }
  }, [open]);

  async function send() {
    if (busy) return;
    setErr(""); setBusy(true);
    /* راية التجربة: بلا رمز فبلا خطوة ثانية — يُبدَّل الرقم فوراً وتُغلق
       الورقة. تركُ هذا المسار على الرمز وحده كان سيصنع حائطاً في منتصف
       تجربةٍ لا رموز فيها: يفتح المستخدم «تغيير الرقم» فيُطلب منه رمز
       لا يصله أبداً. */
    if (SKIP_OTP) {
      const r = await changePhoneNoOtp(phone);
      setBusy(false);
      if (isFail(r)) { setErr(authErrorMessage(r, t)); return; }
      onSession(r.session); onClose(); onDone();
      return;
    }
    const r = await requestPhoneChange(phone);
    setBusy(false);
    if (isFail(r)) { setErr(authErrorMessage(r, t)); return; }
    setStep("code");
  }

  async function confirm() {
    if (busy) return;
    setErr(""); setBusy(true);
    const r = await confirmPhoneChange(phone, code);
    setBusy(false);
    if (isFail(r)) { setErr(authErrorMessage(r, t)); return; }
    onSession(r.session);
    onClose();
    onDone();
  }

  const canSend = validPhone(phone);
  /* ٦ لا ٤: رمز Supabase ستّة أرقام دائماً، ومطابقة الدخول (CustomerApp)
     تمنع زرّاً يُفعَّل قبل اكتمال الرمز فيُستهلك محاولةً بلا داعٍ. */
  const canConfirm = code.trim().length >= 6;

  return (
    <Sheet open={open} onClose={onClose} title={t("changePhone")}
      footer={
        step === "phone"
          ? <CTAButton full onClick={send} disabled={busy || !canSend}>
              {busy ? <BtnSpinner /> : null}
              {t("sendCode")}
            </CTAButton>
          : <CTAButton full onClick={confirm} disabled={busy || !canConfirm}>
              {busy ? <BtnSpinner /> : null}
              {t("verifyNewPhone")}
            </CTAButton>
      }>
      <div className="flex flex-col" style={{ gap: 16 }}>
        {/* الرقم الحالي معروض لا مخفيّ: التغيير قرار يُقارَن فيه */}
        <div className="ac-current">
          <span style={{ ...T.meta, color: C.ink2 }}>{t("phone")}</span>
          <span style={{ ...T.body, color: C.ink, ...LTR }}>{session.phoneLocal}</span>
        </div>

        {step === "phone" ? (
          <Labeled label={t("newPhone")} hint={t("phoneChangeHint")}>
            <PhoneField value={phone} onChange={setPhone} onEnter={() => canSend && send()} />
          </Labeled>
        ) : (
          <Labeled label={t("enterCode")} hint={`${t("sentTo")} ${phone}`}>
            <InputStack>
              <StackField label={t("enterCode")} value={code} onChange={setCode} last ltr
                inputMode="numeric" placeholder="123456" />
            </InputStack>
          </Labeled>
        )}

        {err && <ErrorNote>{err}</ErrorNote>}
      </div>
    </Sheet>
  );
}

/* ── دفتر المسافرين ──────────────────────────────────────────────── */

function TravellersSection({ t, lang, dir, rows, loading, onChange, onFlash }: {
  t: (k: string) => string; lang: Lang; dir: "rtl" | "ltr";
  rows: Traveller[]; loading: boolean;
  onChange: (r: Traveller[]) => void; onFlash: (m: string) => void;
}) {
  const [edit, setEdit] = useState<Traveller | null>(null);
  const [del, setDel] = useState<Traveller | null>(null);

  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState("");
  /* فشل الحذف كان رفضاً غير ملتقَط: الورقة تبقى مفتوحة بلا كلمة والمعتمر في
     القائمة. الآن يُقال، والصفّ لا يُزال إلا بعد نجاح الحذف. */
  async function remove() {
    if (!del || delBusy) return;
    setDelBusy(true); setDelErr("");
    try {
      await deleteTraveller(del.id);
      onChange(rows.filter(r => r.id !== del.id));
      setDel(null);
      onFlash(t("accountSaved"));
    } catch (e) {
      console.error("[deleteTraveller]", e);
      setDelErr(lang === "en" ? "Couldn't delete. Check your connection and try again." : "تعذّر الحذف. تحقّق من اتصالك وأعد المحاولة.");
    } finally { setDelBusy(false); }
  }

  return (
    <>
      <SectionCard
        title={rows.length ? `${t("travellers")} (${rows.length})` : t("travellers")}
        action={rows.length > 0 && (
          <LinkAction onClick={() => setEdit(emptyTraveller())}><Plus size={16} />{t("addTraveller")}</LinkAction>
        )}>
        {loading ? (
          /* هيكلٌ بشكل الصفّ نفسه — الدوّارة وحدها تجعل البطاقة تقفز حين تصل الصفوف */
          [0, 1].map(i => (
            <div key={i} className="ac-trav" aria-hidden>
              <span className="ac-skel" style={{ width: 44, height: 44, borderRadius: "50%" }} />
              <span className="ac-trav-copy" style={{ gap: 8 }}>
                <span className="ac-skel" style={{ width: "55%", height: 14 }} />
                <span className="ac-skel" style={{ width: "38%", height: 12 }} />
              </span>
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className="ac-empty">
            <span aria-hidden><BookUser size={24} /></span>
            <b>{t("noTravellers")}</b>
            <p>{t("noTravellersHint")}</p>
            <button type="button" onClick={() => setEdit(emptyTraveller())}>
              <Plus size={16} />{t("addTraveller")}
            </button>
          </div>
        ) : (
          rows.map(r => (
            <div key={r.id} className="ac-trav">
              <span className="ac-avatar" data-size="sm" aria-hidden>{initial(r.name)}</span>
              <span className="ac-trav-copy">
                <b>{r.name || t("notSet")}</b>
                <small>
                  {r.docType ? docText(docTypeDef(r.docType).label, lang) : t("notSet")}
                  {r.idNumber && <> · <span style={LTR}>{r.idNumber}</span></>}
                </small>
              </span>
              <button type="button" className="ac-icon" onClick={() => setEdit(r)}
                aria-label={`${t("editTraveller")} — ${r.name}`} title={t("editTraveller")}>
                <Pencil size={18} />
              </button>
              <button type="button" className="ac-icon" data-danger="" onClick={() => setDel(r)}
                aria-label={`${t("deleteTraveller")} — ${r.name}`} title={t("deleteTraveller")}>
                <Trash2 size={18} />
              </button>
            </div>
          ))
        )}
      </SectionCard>

      <TravellerSheet
        row={edit} t={t} lang={lang} dir={dir}
        onClose={() => setEdit(null)}
        onSaved={saved => {
          const i = rows.findIndex(r => r.id === saved.id);
          onChange(i >= 0 ? rows.map(r => (r.id === saved.id ? saved : r)) : [...rows, saved]);
          setEdit(null);
          onFlash(t("accountSaved"));
        }}
      />

      {/* الحذف يُسأل عنه لأنه لا يُستردّ — ويُطمأن أنه لا يمسّ الحجوزات */}
      <Sheet open={!!del} onClose={() => { setDel(null); setDelErr(""); }} title={t("deleteTraveller")}
        footer={
          <div className="flex" style={{ gap: 10 }}>
            <GrayButton full onClick={() => setDel(null)} style={{ flex: 1, height: 50, borderRadius: 999 }}>
              {t("cancel")}
            </GrayButton>
            <button type="button" onClick={remove} disabled={delBusy} className="ac-danger-btn" style={delBusy ? { opacity: .6 } : undefined}>{t("delete")}</button>
          </div>
        }>
        <div style={{ ...T.body, color: C.ink }}>
          {t("deleteTravellerAsk").replace("{name}", del?.name || "")}
        </div>
        <div style={{ ...T.meta, color: C.ink2, marginTop: 6 }}>{t("deleteTravellerNote")}</div>
        {delErr && <div role="alert" style={{ ...T.meta, color: C.danger, background: C.dangerTint, borderRadius: 12, padding: "10px 12px", marginTop: 12 }}>{delErr}</div>}
      </Sheet>
    </>
  );
}

function TravellerSheet({ row, t, lang, dir, onClose, onSaved }: {
  row: Traveller | null; t: (k: string) => string; lang: Lang; dir: "rtl" | "ltr";
  onClose: () => void; onSaved: (r: Traveller) => void;
}) {
  const [f, setF] = useState<Traveller>(emptyTraveller());
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { if (row) { setF(row); setTried(false); setErr(""); } }, [row?.id, row]);

  const set = <K extends keyof Traveller>(k: K, v: Traveller[K]) => setF(x => ({ ...x, [k]: v }));

  const docDef = f.docType ? docTypeDef(f.docType) : null;
  const errs = {
    name: !f.name.trim() ? t("required") : !validName(f.name) ? t("nameErr") : "",
    docType: !f.docType ? t("required") : "",
    idNumber: !f.idNumber.trim() ? t("required")
      : docDef && !docDef.test(f.idNumber.trim()) ? docText(docDef.error, lang) : "",
    nationality: !f.nationality ? t("required") : "",
    birthDate: !f.birthDate ? t("required") : "",
    phone: f.phone.trim() && !validPhone(f.phone) ? t("invalidPhone") : "",
  };
  const valid = Object.values(errs).every(v => !v);
  const show = (k: keyof typeof errs) => (tried ? errs[k] : "");

  async function submit() {
    setTried(true); setErr("");
    if (!valid || busy) return;
    setBusy(true);
    try { onSaved(await saveTraveller(f)); }
    catch (e) { setErr(travellerSaveError(e, lang)); }
    finally { setBusy(false); }
  }

  return (
    <Sheet open={!!row} onClose={onClose}
      title={row?.id ? t("editTraveller") : t("addTraveller")}
      footer={
        <CTAButton full onClick={submit} disabled={busy}>
          {busy ? <BtnSpinner /> : null}
          {t("save")}
        </CTAButton>
      }>
      <div className="flex flex-col" style={{ gap: 16 }}>
        <Labeled label={t("name")} hint={show("name") || undefined} bad={!!show("name")}>
          <InputStack>
            <StackField label={t("name")} value={f.name} onChange={v => set("name", v)} last
              error={show("name") ? " " : undefined} />
          </InputStack>
        </Labeled>

        <Labeled label={t("docType")} hint={show("docType") || t("docTypeHint")} bad={!!show("docType")}>
          <SearchSelect
            value={f.docType ?? ""} placeholder={t("docTypePh")} dir={dir}
            invalid={!!show("docType")}
            onChange={v => set("docType", (v || undefined) as DocType | undefined)}
            options={DOC_TYPES.map(d => ({ value: d.value, label: docText(d.label, lang) }))}
          />
        </Labeled>

        {f.docType && (
          <Labeled label={docText(docDef!.numberLabel, lang)} hint={show("idNumber") || undefined} bad={!!show("idNumber")}>
            <InputStack>
              <StackField label={docText(docDef!.numberLabel, lang)} value={f.idNumber}
                onChange={v => set("idNumber", v)} last ltr inputMode="text"
                error={show("idNumber") ? " " : undefined} />
            </InputStack>
          </Labeled>
        )}

        <Labeled label={t("nationality")} hint={show("nationality") || undefined} bad={!!show("nationality")}>
          <NationalitySelect lang={lang} dir={dir} value={f.nationality}
            invalid={!!show("nationality")} onChange={v => set("nationality", v)} />
        </Labeled>

        <Labeled label={t("birthDate")} hint={show("birthDate") || undefined} bad={!!show("birthDate")}>
          <BirthDateSelect lang={lang} dir={dir} value={f.birthDate}
            invalid={!!show("birthDate")} onChange={v => set("birthDate", v)} />
        </Labeled>

        <Labeled label={t("gender")}>
          <div className="ac-seg" data-tall="" role="radiogroup" aria-label={t("gender")}>
            {([["male", t("male")], ["female", t("female")]] as const).map(([v, lbl]) => {
              const on = f.gender === v;
              return (
                <button key={v} type="button" role="radio" aria-checked={on}
                  data-on={on ? "" : undefined} onClick={() => set("gender", v)}>
                  {on && <Check size={16} strokeWidth={2.6} aria-hidden />}
                  {lbl}
                </button>
              );
            })}
          </div>
        </Labeled>

        {/* جوال المرافق اختياري — الطفل لا جوال له، والتواصل عبر صاحب الحساب */}
        <Labeled label={t("phone")} hint={show("phone") || t("optional")} bad={!!show("phone")}>
          <PhoneField value={f.phone} onChange={v => set("phone", v)}
            error={show("phone") ? " " : undefined} />
        </Labeled>

        {err && <ErrorNote>{err}</ErrorNote>}
      </div>
    </Sheet>
  );
}
