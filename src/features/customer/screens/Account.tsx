/* صفحة «حسابي» — الهوية والبيانات ودفتر المسافرين.

   بُنيت على نظام صفحة المستفيد (C/T/R وكِت الواجهة) لا على ثيمة لوحة
   الموظف: الصفحة القديمة كانت بطاقة خضراء متدرّجة وأزرار B، فبدت من
   تطبيق آخر بمجرّد الانتقال إليها من الاستكشاف.

   البنية صفوف قراءة أولاً والتحرير في أوراق سفلية: الصفحة تُقرأ في نظرة
   ولا تتحوّل إلى نموذج طويل، والتعديل يبقى مقصوداً لا عرضياً. */
import { useEffect, useState } from "react";
import { ChevronLeft, Plus, Pencil, Trash2, Check, LogOut, Globe, Ticket, UserRound } from "lucide-react";
import { C, T, R, SPACE, LTR, flipRTL } from "../ui/tokens";
import { Sheet, CTAButton, GrayButton, OutlineButton, useDir } from "../ui/kit";
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

const validPhone = (p: string) => /^(05\d{8}|(\+?966)5\d{8})$/.test(p.replace(/\s/g, ""));
const validName  = (s: string) => s.trim().split(/\s+/).filter(Boolean).length >= 2 && s.trim().length >= 5;
const initial = (s: string) => s.trim().charAt(0) || "؟";

/* ── لبنات العرض ─────────────────────────────────────────────────── */

function SectionCard({ title, action, children }: {
  title: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col" style={{ gap: 10 }}>
      <div className="flex items-center justify-between" style={{ gap: 8 }}>
        <h2 style={{ ...T.h3, color: C.ink, margin: 0 }}>{title}</h2>
        {action}
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: R.card, background: C.white, overflow: "hidden" }}>
        {children}
      </div>
    </section>
  );
}

/** صفّ «تسمية ← قيمة» مع إجراء اختياري على الحافّة. */
function Row({ label, value, action, first }: {
  label: string; value: React.ReactNode; action?: React.ReactNode; first?: boolean;
}) {
  return (
    <div className="flex items-center justify-between"
      style={{ gap: 12, padding: "12px 14px", borderTop: first ? "none" : `1px solid ${C.line}` }}>
      <span style={{ ...T.meta, color: C.ink2, flexShrink: 0 }}>{label}</span>
      <span className="flex items-center min-w-0" style={{ gap: 10 }}>
        <span className="truncate" style={{ ...T.body, color: C.ink, textAlign: "end" }}>{value}</span>
        {action}
      </span>
    </div>
  );
}

function NavRow({ icon, label, onClick, first }: {
  icon: React.ReactNode; label: string; onClick: () => void; first?: boolean;
}) {
  const dir = useDir();
  return (
    <button onClick={onClick} className="flex items-center w-full"
      style={{
        gap: 10, padding: "14px", borderTop: first ? "none" : `1px solid ${C.line}`,
        background: "none", border: "none", cursor: "pointer", textAlign: "start",
      }}>
      <span style={{ color: C.green, display: "flex", flexShrink: 0 }}>{icon}</span>
      <span className="flex-1" style={{ ...T.body, color: C.ink }}>{label}</span>
      <ChevronLeft size={17} style={{ color: C.ink3, flexShrink: 0, ...flipRTL(dir) }} />
    </button>
  );
}

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
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!session) { setTravellers([]); return; }
    let alive = true;
    setLoadingTr(true);
    fetchTravellers()
      .then(rows => { if (alive) setTravellers(rows); })
      .finally(() => { if (alive) setLoadingTr(false); });
    return () => { alive = false; };
  }, [session?.userId]);

  /* رسالة نجاح قصيرة بدل ورقة تأكيد: الحفظ نجح والصفحة تُظهر أثره سلفاً. */
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2600); };

  const fullName = [session?.profile?.firstName, session?.profile?.lastName].filter(Boolean).join(" ");

  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center" style={{ padding: SPACE.page, gap: 14 }}>
        <span className="flex items-center justify-center"
          style={{ width: 64, height: 64, borderRadius: R.pill, background: C.greenTint, color: C.green }}>
          <UserRound size={28} />
        </span>
        <div className="text-center">
          <div style={{ ...T.h3, color: C.ink }}>{t("guestAccount")}</div>
          <div style={{ ...T.meta, color: C.ink2, marginTop: 4 }}>{t("guestAccountHint")}</div>
        </div>
        <div style={{ width: "100%", maxWidth: 280 }}>
          <CTAButton full onClick={p.onLogin}>{t("login")}</CTAButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col" style={{ padding: SPACE.page, gap: 22 }}>
      {/* ── الهوية ── */}
      <div className="flex items-center" style={{ gap: 12 }}>
        <span className="flex items-center justify-center flex-shrink-0"
          style={{ width: 56, height: 56, borderRadius: R.pill, background: C.greenTint, color: C.green, ...T.h2 }}>
          {initial(fullName || session.phoneLocal)}
        </span>
        <div className="min-w-0">
          <div className="truncate" style={{ ...T.h2, color: C.ink }}>{fullName || t("notSet")}</div>
          <div className="flex items-center" style={{ gap: 7, marginTop: 3 }}>
            <span style={{ ...T.meta, color: C.ink2, ...LTR }}>{session.phoneLocal}</span>
            <span className="flex items-center" style={{
              ...T.small, fontWeight: 600, gap: 3, background: C.greenTint, color: C.green,
              borderRadius: R.pill, padding: "2px 8px",
            }}>
              <Check size={11} />{t("verifiedBadge")}
            </span>
          </div>
        </div>
      </div>

      <ProfileSection {...p} onSaved={m => flash(m)} />

      <TravellersSection
        t={t} lang={lang} dir={dir} rows={travellers} loading={loadingTr}
        onChange={setTravellers} onFlash={flash}
      />

      <SectionCard title={t("settings")}>
        <NavRow first icon={<Ticket size={17} />} label={t("myBookings")} onClick={p.onBookings} />
        <div style={{ padding: 14, borderTop: `1px solid ${C.line}` }}>
          <div className="flex items-center" style={{ gap: 10, marginBottom: 10 }}>
            <Globe size={17} style={{ color: C.green }} />
            <span style={{ ...T.body, color: C.ink }}>{t("language")}</span>
          </div>
          <div className="flex" style={{ gap: 8 }}>
            {LANGS.map(l => {
              const on = lang === l.code;
              return (
                <button key={l.code} onClick={() => p.setLang(l.code)}
                  style={{
                    flex: 1, padding: "9px 6px", borderRadius: R.button, cursor: "pointer",
                    ...T.meta, fontWeight: on ? 600 : 400, fontFamily: "inherit",
                    border: `1px solid ${on ? C.green : C.border}`,
                    background: on ? C.greenTint : C.white, color: on ? C.green : C.ink,
                  }}>
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>
      </SectionCard>

      <button onClick={p.onLogout} className="flex items-center justify-center"
        style={{
          gap: 8, padding: "13px", borderRadius: R.card, cursor: "pointer",
          border: `1px solid ${C.border}`, background: C.white, color: C.danger,
          ...T.body, fontWeight: 600, fontFamily: "inherit",
        }}>
        <LogOut size={16} />{t("logout")}
      </button>

      {/* شريط نجاح عائم — لا يزيح المحتوى ولا يطلب إغلاقاً */}
      {toast && (
        <div style={{
          position: "fixed", insetInline: SPACE.page, bottom: 96, zIndex: 40,
          background: C.ink, color: C.white, borderRadius: R.card,
          padding: "12px 14px", ...T.meta, textAlign: "center",
        }}>
          {toast}
        </div>
      )}
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

  return (
    <>
      <SectionCard
        title={t("myDetails")}
        action={<OutlineButton onClick={openSheet}>{t("editDetails")}</OutlineButton>}>
        <Row first label={t("legalName")} value={[pr?.firstName, pr?.lastName].filter(Boolean).join(" ") || t("notSet")} />
        <Row label={t("birthDate")} value={pr?.birthDate ? <span style={LTR}>{pr.birthDate}</span> : t("notSet")} />
        <Row label={t("email")} value={pr?.email || t("notSet")} />
        <Row
          label={t("phone")}
          value={<span style={LTR}>{session!.phoneLocal}</span>}
          action={<OutlineButton onClick={() => setPhoneOpen(true)}>{t("changePhone")}</OutlineButton>}
        />
      </SectionCard>

      <Sheet open={open} onClose={() => setOpen(false)} title={t("editDetails")}
        footer={
          <CTAButton full onClick={submit} disabled={busy || !valid}>
            {busy ? <Spinner size={15} track="rgba(255,255,255,.35)" color={C.white} /> : null}
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
          {err && <div style={{ ...T.meta, color: C.danger }}>{err}</div>}
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
              {busy ? <Spinner size={15} track="rgba(255,255,255,.35)" color={C.white} /> : null}
              {t("sendCode")}
            </CTAButton>
          : <CTAButton full onClick={confirm} disabled={busy || !canConfirm}>
              {busy ? <Spinner size={15} track="rgba(255,255,255,.35)" color={C.white} /> : null}
              {t("verifyNewPhone")}
            </CTAButton>
      }>
      <div className="flex flex-col" style={{ gap: 16 }}>
        {/* الرقم الحالي معروض لا مخفيّ: التغيير قرار يُقارَن فيه */}
        <div className="flex items-center justify-between"
          style={{ padding: "12px 14px", borderRadius: R.card, background: C.fill }}>
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

        {err && <div style={{ ...T.meta, color: C.danger }}>{err}</div>}
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

  async function remove() {
    if (!del) return;
    await deleteTraveller(del.id);
    onChange(rows.filter(r => r.id !== del.id));
    setDel(null);
    onFlash(t("accountSaved"));
  }

  return (
    <>
      <SectionCard
        title={rows.length ? `${t("travellers")} (${rows.length})` : t("travellers")}
        action={
          <OutlineButton onClick={() => setEdit(emptyTraveller())}>
            <span className="flex items-center" style={{ gap: 4 }}><Plus size={13} />{t("addTraveller")}</span>
          </OutlineButton>
        }>
        {loading ? (
          <div className="flex items-center justify-center" style={{ padding: 24 }}>
            <Spinner size={18} />
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 18 }}>
            <div style={{ ...T.body, color: C.ink }}>{t("noTravellers")}</div>
            <div style={{ ...T.meta, color: C.ink2, marginTop: 4 }}>{t("noTravellersHint")}</div>
          </div>
        ) : (
          rows.map((r, i) => (
            <div key={r.id} className="flex items-center"
              style={{ gap: 11, padding: "12px 14px", borderTop: i ? `1px solid ${C.line}` : "none" }}>
              <span className="flex items-center justify-center flex-shrink-0"
                style={{ width: 38, height: 38, borderRadius: R.pill, background: C.greenTint, color: C.green, ...T.body, fontWeight: 600 }}>
                {initial(r.name)}
              </span>
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="truncate" style={{ ...T.body, color: C.ink }}>{r.name || t("notSet")}</span>
                <span className="truncate" style={{ ...T.small, color: C.ink2 }}>
                  {r.docType ? docText(docTypeDef(r.docType).label, lang) : t("notSet")}
                  {r.idNumber && <> · <span style={LTR}>{r.idNumber}</span></>}
                </span>
              </span>
              <button onClick={() => setEdit(r)} aria-label={t("editTraveller")}
                style={{ background: "none", border: "none", cursor: "pointer", color: C.ink2, padding: 6, flexShrink: 0 }}>
                <Pencil size={15} />
              </button>
              <button onClick={() => setDel(r)} aria-label={t("deleteTraveller")}
                style={{ background: "none", border: "none", cursor: "pointer", color: C.danger, padding: 6, flexShrink: 0 }}>
                <Trash2 size={15} />
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
      <Sheet open={!!del} onClose={() => setDel(null)} title={t("deleteTraveller")}
        footer={
          <div className="flex" style={{ gap: 10 }}>
            <GrayButton full onClick={() => setDel(null)}>{t("cancel")}</GrayButton>
            <button onClick={remove}
              style={{
                flex: 1, padding: "14px", borderRadius: R.pill, border: "none", cursor: "pointer",
                background: C.danger, color: C.white, ...T.body, fontWeight: 600, fontFamily: "inherit",
              }}>
              {t("delete")}
            </button>
          </div>
        }>
        <div style={{ ...T.body, color: C.ink }}>
          {t("deleteTravellerAsk").replace("{name}", del?.name || "")}
        </div>
        <div style={{ ...T.meta, color: C.ink2, marginTop: 6 }}>{t("deleteTravellerNote")}</div>
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
    catch (e) { setErr((e as { message?: string })?.message || t("errUnknown")); }
    finally { setBusy(false); }
  }

  return (
    <Sheet open={!!row} onClose={onClose}
      title={row?.id ? t("editTraveller") : t("addTraveller")}
      footer={
        <CTAButton full onClick={submit} disabled={busy}>
          {busy ? <Spinner size={15} track="rgba(255,255,255,.35)" color={C.white} /> : null}
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
          <div className="flex" style={{ gap: 8 }}>
            {([["male", t("male")], ["female", t("female")]] as const).map(([v, lbl]) => {
              const on = f.gender === v;
              return (
                <button key={v} onClick={() => set("gender", v)}
                  style={{
                    flex: 1, padding: "11px 6px", borderRadius: R.button, cursor: "pointer",
                    ...T.body, fontWeight: on ? 600 : 400, fontFamily: "inherit",
                    border: `1px solid ${on ? C.green : C.border}`,
                    background: on ? C.greenTint : C.white, color: on ? C.green : C.ink,
                  }}>
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

        {err && <div style={{ ...T.meta, color: C.danger }}>{err}</div>}
      </div>
    </Sheet>
  );
}
