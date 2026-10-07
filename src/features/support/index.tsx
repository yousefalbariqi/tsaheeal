import { useEffect, useRef, useState } from "react";
import {
  X, FileText, Clock, CheckCircle2, UserCheck, MessageSquare, LifeBuoy, SearchX, Plus, UploadCloud,
  ArrowRight, Paperclip, Copy, AlertTriangle, Send,
} from "lucide-react";
import { toast } from "sonner";
import { B, TONE, type ToneName } from "@/lib/theme";
import { EntityGate, EmptyState } from "@/components/States";
import type { SupportPriority, SupportStatus, SupportReq, SystemUser } from "@/types";
import { PageHeader } from "@/components/PageHeader";
import { AppSelect } from "@/components/AppSelect";
import { Field } from "@/components/Field";
import { StatusBadge } from "@/components/StatusBadge";
import { EventTimeline } from "@/components/EventTimeline";
import { Badge, Button, IconButton, Input, ModalIcon, Note, Segmented, Textarea } from "@/components/ui";
import { useStore } from "@/store/useStore";
import { newId } from "@/lib/utils";
import { statusLabel } from "@/lib/status";
import { fmtDate, fmtDateTime, fmtRelativeDay } from "@/lib/dates";
import { uploadMedia, MAX_IMAGE_BYTES, MEDIA_BUCKET, MediaError, takeFile } from "@/lib/mediaUpload";
import { supabase, isSupabaseEnabled } from "@/supabase/client";
import { fetchSettings } from "@/data/settings";
import { configureSla, currentSla, slaDueAt, isOpenAt, type SlaConfig } from "@/features/customer/sla";
import { logDocEvent, type DocType } from "@/features/docs/docEvents";

const SUPPORT_CATS = ["عام","تقني — أخطاء في النظام","مالي — فواتير وتحصيل","محتوى — تعديل النصوص","باقات ورحلات","حجوزات وتذاكر","طلب ميزة جديدة"];

/* الأولوية بلون المعنى من اللوحة: العاجل خطر، المتوسط تنبيه، والمنخفض
   محايد — كان أخضر، والأخضر يُقرأ «تمّ» لا «غير مستعجل». */
const PRIORITIES: SupportPriority[] = ["عاجل","متوسط","منخفض"];
const PRIO_TONE: Record<SupportPriority,ToneName> = { "عاجل":"danger", "متوسط":"warn", "منخفض":"neutral" };
const PrioBadge = ({p}:{p:SupportPriority}) => <Badge tone={PRIO_TONE[p]}>{p}</Badge>;

const SUP_STATUSES:SupportStatus[] = ["sent","reviewing","resolved","closed"];
/* صياغة الحالة المعروضة من معجم اللوحة (lib/status) عبر <StatusBadge>، فلا
   خريطة ألوانٍ محلية. هذه الصياغة القديمة باقيةٌ لنصّ الملاحظة المكتوبة في
   سجلّ الأحداث وحده — ما يُحفظ لا يتغيّر بتغيير المظهر. */
const SUP_STATUS_LABELS:Record<SupportStatus,string> = {sent:"مُرسَل",reviewing:"قيد المراجعة",resolved:"تم الحل",closed:"مغلق"};
const supLabel = (s:SupportStatus) => statusLabel(s,"support");

const STATUS_LEGEND:[SupportStatus,string][] = [
  ["sent","تم إرسال الطلب وهو في انتظار المراجعة من الفريق التقني"],
  ["reviewing","يعمل الفريق على دراسة الطلب وإيجاد حل مناسب"],
  ["resolved","تم معالجة الطلب — يُرجى التحقق من الحل وإبلاغنا"],
  ["closed","تم إغلاق الطلب بعد التأكيد من الطرفين"],
];

/* نوع المستند في سجلّ الأحداث. قائمة DocEventType في types/index.ts
   تُحرَّر بالتوازي من غيرنا فلا تُوسَّع من هنا — التحويل موضعيّ، والقاعدة
   (قيد doc_type في ترحيل 20260913) هي التي تحسم القبول. حين تُضاف
   "support" إلى القائمة يُحذف هذا التحويل. */
const SUPPORT_DOC = "support" as unknown as DocType;

/* ══════════════ المرفقات: النوع والحجم والبصمة ══════════════
   «تحقق من نوع وحجم الملف، افحصه، واحفظه بصلاحية خاصة». كان الحقل
   يقبل image/* بلا حدّ ويرفع أيّ شيء يسمّي نفسه صورة. الآن: صورة
   (jpeg/png/webp ≤ 8MB) أو PDF (≤ 8MB)، وتُقرأ أوّل بايتات الملف
   للتأكّد أنّ محتواه يطابق نوعه المعلَن — ملفٌّ تنفيذيّ مُعاد تسميته
   .png يمرّ من فحص الامتداد ولا يمرّ من فحص البصمة. */
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_ATTACHMENTS = 4;
type AttachKind = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
const KIND_LABEL:Record<AttachKind,string> = {
  "image/jpeg":"صورة JPG", "image/png":"صورة PNG", "image/webp":"صورة WebP", "application/pdf":"ملف PDF",
};
const ACCEPT = Object.keys(KIND_LABEL).join(",");
const mb = (n:number) => (n / (1024 * 1024)).toFixed(n < 1024 * 1024 ? 1 : 0);

/** بصمة الملف من أوّل اثني عشر بايتاً — لا من امتداده ولا من نوعه المعلَن. */
async function sniffKind(file:File):Promise<AttachKind|null> {
  const buf = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const at = (i:number) => buf[i] ?? -1;
  const ascii = (s:number, e:number) => String.fromCharCode(...Array.from(buf.slice(s, e)));
  if (at(0) === 0xFF && at(1) === 0xD8 && at(2) === 0xFF) return "image/jpeg";
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4E && at(3) === 0x47) return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(0, 4) === "%PDF") return "application/pdf";
  return null;
}

/** يعيد نوع الملف المؤكَّد، أو رسالة رفضٍ عربية يفهمها الموظف. */
async function validateAttachment(file:File):Promise<{kind:AttachKind}|{error:string}> {
  const declared = file.type as AttachKind;
  if (!(declared in KIND_LABEL)) {
    return { error:"النوع غير مقبول — المسموح: صورة JPG أو PNG أو WebP، أو ملف PDF." };
  }
  if (file.size === 0) return { error:"الملف فارغ." };
  const cap = declared === "application/pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (file.size > cap) return { error:`حجم الملف ${mb(file.size)} ميغابايت — الحدّ ${mb(cap)} ميغابايت.` };
  const kind = await sniffKind(file);
  if (!kind) return { error:"محتوى الملف لا يطابق أيّ نوعٍ مقبول — قد يكون معطوباً أو مُعاد تسميته." };
  if (kind !== declared) return { error:`الملف يقول إنه ${KIND_LABEL[declared]} ومحتواه ${KIND_LABEL[kind]} — رُفض احتياطاً.` };
  return { kind };
}

const readAsDataUrl = (file:File):Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new MediaError("تعذّر قراءة الملف."));
    r.readAsDataURL(file);
  });

/* رفع المرفق إلى مجلّد support/ في دلو media.

   الصور عبر uploadMedia — نفس المسار والحدود والرسائل. أمّا PDF فيُرفع
   مباشرةً إلى نفس الدلو والمجلّد: uploadMedia يقبل الصور والمقاطع
   وحدها، وتوسيعه يلمس ملفاً يعمل عليه غيرنا الآن. المسار عشوائي
   (randomUUID) كبقيّة الوسائط — لا يُخمَّن، وسردُ الدلو للموظفين وحدهم.
   في وضع التجربة يُعاد data:URL كما تفعل بقيّة نقاط الرفع. */
async function uploadAttachment(file:File, kind:AttachKind):Promise<string> {
  if (kind !== "application/pdf") return uploadMedia(file, "support");
  if (!isSupabaseEnabled || !supabase) return readAsDataUrl(file);
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `support/${rand}.pdf`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    cacheControl:"31536000", upsert:false, contentType:"application/pdf",
  });
  if (error) {
    const m = String(error.message ?? "");
    if (/mime|not supported|not allowed/i.test(m)) {
      throw new MediaError("الخادم يرفض ملفات PDF بعد — نفّذ ترحيل 20260913_support_desk.sql.");
    }
    if (/row-level security|not authorized|Unauthorized/i.test(m)) {
      throw new MediaError("لا تملك صلاحية رفع الملفات — راجع مدير النظام.");
    }
    throw new MediaError(m || "تعذّر رفع الملف.");
  }
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new MediaError("تمّ الرفع ولم يُعَد رابط الملف.");
  return data.publicUrl;
}

const isPdfUrl = (url:string) => /\.pdf($|[?#])/i.test(url) || url.startsWith("data:application/pdf");

/* ══════════════ وعد الردّ ══════════════
   نفس دالة المستفيد (slaDueAt): ساعات عمل لا ساعات جدارية، تقف خارج
   النافذة ويوم الجمعة والإجازة، وتستأنف من الفتح. طلبٌ بعد الإغلاق يبدأ
   عدّه من فتح أوّل يوم عملٍ قادم. */

/* لحظة الإرسال: createdAt (ترحيل 20260913)، وإلا منتصف ليل الرياض من
   `date` — تقريبٌ للصفوف القديمة، ووعدها المحسوب منه يبدأ من فتح المكتب
   ذاك اليوم. */
const submittedMs = (r:SupportReq):number => {
  const t = r.createdAt ? Date.parse(r.createdAt) : NaN;
  if (!Number.isNaN(t)) return t;
  const d = Date.parse(`${r.date}T00:00:00+03:00`);
  return Number.isNaN(d) ? Date.now() : d;
};

/* lib/dates يقرأ نصّ التخزين كما كُتب (بلا منطقة زمنية)؛ اللحظة تُحوَّل
   أوّلاً إلى ساعة الرياض ثم تُنسَّق بصياغة اللوحة. */
const fmtWhen = (ms:number):string =>
  fmtDateTime(new Date(ms + 3 * 3_600_000).toISOString().slice(0,16).replace("T"," "));

/** «ساعتَي عمل» · «٣ ساعات عمل» · «١٢ ساعة عمل». */
const hoursLabel = (n:number):string =>
  n === 1 ? "ساعة عمل واحدة" : n === 2 ? "ساعتَي عمل" : n <= 10 ? `${n} ساعات عمل` : `${n} ساعة عمل`;

type ReplyPromise =
  | { kind:"answered"; at?:number }
  | { kind:"overdue"; due:number }
  | { kind:"due"; due:number }
  | { kind:"unknown" };

function replyPromise(cfg:SlaConfig, r:SupportReq, now:number):ReplyPromise {
  if (r.status === "resolved" || r.status === "closed") {
    const at = r.resolvedAt ? Date.parse(r.resolvedAt) : NaN;
    return { kind:"answered", at: Number.isNaN(at) ? undefined : at };
  }
  const due = slaDueAt(cfg, submittedMs(r));
  if (due == null) return { kind:"unknown" };
  return now > due ? { kind:"overdue", due } : { kind:"due", due };
}

function PromiseLine({ p }:{ p:ReplyPromise }) {
  if (p.kind === "unknown") return <span className="text-xs" style={{color:B.muted}}>وعد الردّ غير محسوب</span>;
  if (p.kind === "answered") {
    return <span className="text-xs inline-flex items-center gap-1" style={{color:TONE.success.fg}}>
      <CheckCircle2 size={13}/>تم الردّ{p.at != null && <> · {fmtWhen(p.at)}</>}
    </span>;
  }
  const overdue = p.kind === "overdue";
  return <span className="text-xs inline-flex items-center gap-1" style={{color: overdue ? TONE.danger.fg : B.text2, fontWeight: overdue ? 600 : 400}}>
    {overdue ? <AlertTriangle size={13}/> : <Clock size={13}/>}
    {overdue ? "متأخّر عن الوعد" : "الردّ قبل"} {fmtWhen(p.due)}
  </span>;
}

/* users.id هو uuid الحساب فقط للحسابات المُنشأة من اللوحة؛ السجلات
   القديمة تحمل U-01 ولا ملفَ لها في profiles — فلا تُعرض للتعيين. */
const isUuid = (s:string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export function SupportPage({onMenuOpen}:{onMenuOpen?:()=>void}) {
  /* بريد الدعم من الإعدادات وحدها.

     كان يبدأ بالافتراضي (support@tasahheel.com) ثم يُستبدل بالمقروء —
     فإن كان حقل الإعدادات فارغاً بقي الافتراضي معروضاً. الشاشة تَعِد
     ببريدٍ لم يضبطه أحد، وقد لا يكون له صندوق أصلاً: الطلب يُرسَل إلى
     العدم والمرسِل يظنّه وصل. وهي ملاحظة الفريق: «امنع القيمة الثابتة
     المتعارضة».

     ثلاث حالات لا اثنتان — undefined لم يصل بعد، و"" لم يُضبط، ونصٌّ
     مضبوط. والفراغ يُقال صراحةً بدل أن يُملأ بقيمةٍ من الشفرة. */
  const [supportEmail,setSupportEmail]=useState<string|undefined>(undefined);
  /* نافذة العمل ووعد الردّ من نفس الإعدادات — تُضبط عالمياً (كما تفعل
     لوحة المؤشرات وتطبيق المستفيد) وتُنسخ محلياً لتُمرَّر صريحةً للدالة
     النقيّة؛ قراءةٌ واحدة تُغني عن قراءتين. */
  const [sla,setSla]=useState<SlaConfig>(()=>currentSla());
  useEffect(()=>{ let alive=true;
    fetchSettings()
      .then(c=>{ if(!alive) return; setSupportEmail((c.internal.supportEmail??"").trim()); configureSla(c.pub); setSla(currentSla()); })
      .catch(e=>{ console.error("[support] تعذّر جلب إعدادات الدعم:",e); if(alive) setSupportEmail(""); });
    return ()=>{ alive=false; };
  },[]);
  /* «متأخّر عن الوعد» يتغيّر مع الوقت لا مع البيانات — نبضة كل دقيقة تكفي. */
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{ const t=setInterval(()=>setNow(Date.now()),60_000); return ()=>clearInterval(t); },[]);

  const [search,setSearch]=useState("");
  const reqs=useStore(s=>s.support); const setReqs=useStore(s=>s.setSupport);
  const users=useStore(s=>s.users);
  /* الجلسة الفعلية: currentUser من profiles، والبريد من رمز الدخول نفسه
     (profiles لا يحمل عموداً للبريد). */
  const currentUser=useStore(s=>s.currentUser);
  const authEmail=useStore(s=>s.session?.user?.email ?? "");
  const authPhone=useStore(s=>s.session?.user?.phone ?? "");
  const dash=(v?:string|null)=>(v&&String(v).trim())?String(v).trim():"—";
  const sender=[
    {l:"الاسم", v:dash(currentUser?.name)},
    {l:"الدور", v:dash(currentUser?.role)},
    {l:"الجوال",v:dash(authPhone)},
    {l:"البريد",v:dash(authEmail)},
  ];
  const [category,setCategory]=useState(SUPPORT_CATS[0]);
  const [title,setTitle]=useState("");
  const [desc,setDesc]=useState("");
  const [priority,setPriority]=useState<SupportPriority>("متوسط");
  const [attachments,setAttachments]=useState<string[]>([]);
  const [uploading,setUploading]=useState(false);
  /* ما بعد الإرسال: لوحةٌ ثابتة برقم التذكرة وموعد الردّ لا Toast يختفي
     بعد ثلاث ثوانٍ — الموظف يحتاج الرقم ليسأل عنه غداً. */
  const [lastSent,setLastSent]=useState<{id:string;dueAt:number|null;afterHours:boolean}|null>(null);
  const [openId,setOpenId]=useState<string|null>(null);
  const [highlightId,setHighlightId]=useState<string|null>(null);

  const openReq = openId ? reqs.find(r=>r.id===openId) ?? null : null;
  const patchReq = (id:string, p:Partial<SupportReq>) =>
    setReqs(prev=>prev.map(x=>(x.id===id ? {...x,...p} : x)));

  async function pickAttachment(e:{target:HTMLInputElement}) {
    const file=takeFile(e.target); if(!file) return;
    if(attachments.length>=MAX_ATTACHMENTS){ toast.error(`الحدّ ${MAX_ATTACHMENTS} مرفقات للطلب الواحد.`); return; }
    const v=await validateAttachment(file);
    if("error" in v){ toast.error("مرفق مرفوض",{description:v.error,duration:8000}); return; }
    setUploading(true);
    const tid=toast.loading("جارٍ فحص الملف ورفعه…");
    try {
      const url=await uploadAttachment(file,v.kind);
      setAttachments(a=>[...a,url]);
      toast.success("تم رفع المرفق",{id:tid});
    } catch(err) {
      console.error("[support] فشل رفع المرفق:",err);
      toast.error("تعذّر رفع المرفق",{id:tid,duration:9000,
        description: err instanceof MediaError ? err.message : String((err as Error)?.message ?? err)});
    } finally { setUploading(false); }
  }

  function submit() {
    if(!title.trim()||uploading) return;
    const at=Date.now();
    const nr:SupportReq={
      id:newId("SUP"),
      category, title:title.trim(), desc:desc.trim(), priority, status:"sent",
      date:new Date(at).toISOString().slice(0,10),
      createdAt:new Date(at).toISOString(),
      createdBy:currentUser?.id,
      attachments:attachments.length?attachments:undefined,
    };
    setReqs(p=>[nr,...p]);
    setTitle(""); setDesc(""); setCategory(SUPPORT_CATS[0]); setPriority("متوسط"); setAttachments([]);
    setOpenId(null);
    setLastSent({ id:nr.id, dueAt:slaDueAt(sla,at), afterHours:!isOpenAt(at) });
  }

  /* «متابعة الطلب»: يفتح تفاصيله ويُبرز بطاقته في القائمة ويمرّ إليها —
     الإبراز يزول وحده، والتفاصيل تبقى حتى يعود الموظف للنموذج. */
  function follow(id:string) {
    setOpenId(id); setHighlightId(id);
    requestAnimationFrame(()=>document.getElementById(`sup-${id}`)?.scrollIntoView({behavior:"smooth",block:"center"}));
    setTimeout(()=>setHighlightId(h=>(h===id?null:h)),3000);
  }

  /* على الجوال القائمة أوّلاً واللوحة تحتها: فتحُ طلبٍ أو طلبُ نموذجٍ جديد
     ينزل إليها، وإلا ضُغط الصفّ ولم يتغيّر شيءٌ على الشاشة. على المكتب
     اللوحتان متجاورتان فلا تمرير. */
  const mainRef=useRef<HTMLDivElement>(null);
  const revealMain=()=>{ if(window.matchMedia?.("(max-width: 1023px)").matches)
    setTimeout(()=>mainRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),60); };

  const q=search.trim();
  const visible = q ? reqs.filter(r=>r.id.includes(q)||r.title.includes(q)||r.category.includes(q)) : reqs;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background: B.bg}}>
      <PageHeader title="الدعم الفني" crumb="طلبات الدعم" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}
        searchPlaceholder="ابحث برقم الطلب أو عنوانه أو قسمه"
        actions={openReq&&<Button variant="secondary" icon={<Plus size={16}/>} onClick={()=>{ setOpenId(null); revealMain(); }}>
          <span className="hidden sm:inline">طلب جديد</span><span className="sm:hidden">جديد</span>
        </Button>}/>
      {/* لوحتان: القائمة عند البداية، وبجانبها الطلب المفتوح أو نموذج طلبٍ
          جديد. على الجوال القائمة أوّلاً ثم اللوحة تحتها. */}
      <main className="flex-1 px-4 md:px-8 pt-1 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] gap-5 items-start">
          <aside className="flex flex-col gap-4 min-w-0">
            {/* ── الطلبات السابقة — من جدول support عبر المخزن، لا قائمة ثابتة ──
                كل صفٍّ يحمل حالته وتاريخه ووعد ردّه: «متأخّر عن الوعد»
                يُقرأ من القائمة قبل أن يُفتح الطلب. */}
            <section className="ui-card">
              <div className="ui-card-head">
                <h2 className="ui-card-title">الطلبات السابقة</h2>
                <span className="ts-count">{visible.length}{q&&reqs.length!==visible.length?` من ${reqs.length}`:""}</span>
              </div>
              <div className="p-2">
              <EntityGate entity="support" label="طلبات الدعم" cols={3} rows={3}>
                {visible.length===0 ? (
                  <EmptyState compact icon={q?<SearchX size={20}/>:<LifeBuoy size={20}/>}
                    title={q?"لا طلب يطابق البحث":"لا طلبات سابقة"}
                    note={q?"جرّب رقماً أو كلمةً أخرى.":"ما ترسله من النموذج يظهر هنا بحالته ووعد ردّه."}
                    action={q?<Button variant="secondary" onClick={()=>setSearch("")}>مسح البحث</Button>:undefined}/>
                ) : (
                <div className="flex flex-col gap-0.5 lg:overflow-y-auto" style={{maxHeight:"min(620px, 70vh)",overflowY:"auto"}}>
                  {visible.map(r=>{
                    const isOpen=openId===r.id, lit=highlightId===r.id;
                    const assignee=r.assignedTo?users.find(u=>u.id===r.assignedTo):undefined;
                    return (
                      <button key={r.id} id={`sup-${r.id}`} type="button" onClick={()=>{ setOpenId(isOpen?null:r.id); if(!isOpen) revealMain(); }}
                        aria-pressed={isOpen} aria-label={`فتح الطلب ${r.id}`}
                        className={`ts-pick${isOpen?" is-on":""}`}
                        style={{alignItems:"flex-start",transition:"box-shadow .3s, background-color .12s",
                          boxShadow:lit?"inset 0 0 0 2px var(--k-gold)":"none"}}>
                        <span className="flex-1 min-w-0 flex flex-col gap-1.5">
                          <span className="flex items-start justify-between gap-2">
                            <b className="min-w-0" style={{fontSize:14,fontWeight:600,color:B.black,lineHeight:1.5}}>{r.title}</b>
                            <span className="flex-shrink-0"><StatusBadge status={r.status} entity="support"/></span>
                          </span>
                          <span className="flex items-center gap-x-2 gap-y-1 flex-wrap text-xs" style={{color:B.muted}}>
                            <span dir="ltr">{r.id}</span>
                            <span aria-hidden>·</span>
                            <span>{r.category.split("—")[0].trim()}</span>
                            <span aria-hidden>·</span>
                            <span title={fmtDate(r.date)}>{fmtRelativeDay(r.date)||r.date}</span>
                            {!!r.attachments?.length&&<span className="inline-flex items-center gap-0.5"><Paperclip size={12}/>{r.attachments.length}</span>}
                          </span>
                          <span className="flex items-center justify-between gap-2 flex-wrap">
                            <PromiseLine p={replyPromise(sla,r,now)}/>
                            <span className="inline-flex items-center gap-2">
                              {assignee&&<span className="text-xs inline-flex items-center gap-1" style={{color:B.text2}}><UserCheck size={13}/>{assignee.name}</span>}
                              <PrioBadge p={r.priority}/>
                            </span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                )}
              </EntityGate>
              </div>
            </section>

            {/* Status legend */}
            <section className="ui-card p-5">
              <h2 className="ts-section-title mb-3">حالات طلب الدعم</h2>
              <div className="flex flex-col gap-3">
                {STATUS_LEGEND.map(([k,v])=>(
                  <div key={k} className="flex gap-3 items-start">
                    <span className="flex-shrink-0" style={{minWidth:104}}><StatusBadge status={k} entity="support"/></span>
                    <span className="text-xs" style={{color:B.text2,lineHeight:1.7}}>{v}</span>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          <div ref={mainRef} className="flex flex-col gap-4 min-w-0 order-last" style={{maxWidth:860,scrollMarginTop:88}}>
            {/* ── ما بعد الإرسال: رقم التذكرة وموعد الردّ ── */}
            {lastSent&&(
              <div role="status" className="rounded-2xl p-5" style={{background:TONE.success.bg,border:`1px solid ${TONE.success.line}`}}>
                <div className="flex items-start gap-3">
                  <ModalIcon tone="success"><CheckCircle2 size={20}/></ModalIcon>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-extrabold" style={{color:TONE.success.fg,fontSize:15}}>تم إرسال الطلب</div>
                      <IconButton size="sm" label="إغلاق" onClick={()=>setLastSent(null)}><X size={15}/></IconButton>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4 mt-3">
                      <div className="ts-kv">
                        <span className="ts-kv-k">رقم التذكرة</span>
                        <span className="flex items-center gap-2">
                          <span className="font-extrabold" dir="ltr" style={{color:B.black,fontSize:17}}>{lastSent.id}</span>
                          <IconButton size="sm" variant="outline" label="نسخ رقم التذكرة"
                            onClick={()=>{ navigator.clipboard?.writeText(lastSent.id).then(()=>toast.success("نُسخ رقم التذكرة")).catch(()=>{}); }}><Copy size={14}/></IconButton>
                        </span>
                      </div>
                      <div className="ts-kv">
                        <span className="ts-kv-k">الردّ المتوقّع قبل</span>
                        <span className="ts-kv-v">{lastSent.dueAt!=null?fmtWhen(lastSent.dueAt):"—"}</span>
                        <span className="text-xs" style={{color:B.text2}}>
                          خلال {hoursLabel(sla.slaHours)} · الدوام <span dir="ltr">{sla.openHour}:00–{sla.closeHour}:00</span> بتوقيت الرياض
                        </span>
                      </div>
                    </div>
                    {lastSent.afterHours&&(
                      <Note tone="warn" className="mt-3">أُرسل خارج ساعات العمل — يبدأ احتساب الوعد من فتح المكتب في أوّل يوم عملٍ قادم.</Note>
                    )}
                    {/* داكنٌ لا ذهبي: زرّ الإرسال في النموذج تحته هو الأساسي. */}
                    <div className="flex gap-2 mt-3">
                      <Button variant="dark" onClick={()=>{ follow(lastSent.id); revealMain(); }}>متابعة الطلب</Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {openReq ? (
              <SupportDetail req={openReq} users={users} currentUserId={currentUser?.id} sla={sla} now={now}
                onBack={()=>setOpenId(null)} patch={p=>patchReq(openReq.id,p)}/>
            ) : (
              /* ── Form ── */
              <section className="ui-card">
                <div className="ui-card-head">
                  <div>
                    <h2 className="ui-card-title">طلب دعم جديد</h2>
                    <div className="ui-card-sub">اشرح المشكلة، ويصل الطلب إلى الفريق التقني برقمٍ تتابعه به.</div>
                  </div>
                </div>
                <div className="p-5 flex flex-col gap-4">
                  {/* ── بيانات المُرسِل ──
                      كانت أربع قيم مكتوبة في الشفرة: «سالم أحمد» و«مدير النظام»
                      و0501234567 وsalem@tasahheel.com — تُعرض لكل من يفتح الشاشة
                      مهما كان. يوسف يفتحها فيقرأ بيانات سالم، ويرسل طلباً منسوباً
                      إلى شخصٍ آخر. الآن من الجلسة الفعلية (profiles + auth).

                      وما لا تعرفه الجلسة يُقال «—» صراحةً: قيمةٌ مخترعة في حقل
                      هوية أسوأ من فراغٍ معلَن. وهي داخل النموذج لا فوق الصفحة:
                      تخصّ الطلب الجديد وحده. */}
                  <div className="rounded-xl px-4 py-3" style={{background:B.fill}}>
                    <div className="text-xs mb-2" style={{color:B.muted}}>يُرسَل باسم حسابك</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {sender.map(f=>(
                        <div key={f.l} className="ts-kv"><span className="ts-kv-k">{f.l}</span><span className="ts-kv-v">{f.v}</span></div>
                      ))}
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Field label="القسم">
                        <AppSelect value={category} onChange={setCategory} options={SUPPORT_CATS.map(c=>({value:c,label:c}))}/>
                      </Field>
                    </div>
                    <div>
                      <div className="ui-label" id="sup-prio-label">أولوية الطلب</div>
                      <Segmented label="أولوية الطلب" value={priority} onChange={v=>setPriority(v)} className="w-full"
                        options={PRIORITIES.map(p=>({value:p,label:<><span aria-hidden className="rounded-full" style={{width:7,height:7,background:TONE[PRIO_TONE[p]].fg}}/>{p}</>}))}/>
                    </div>
                  </div>
                  <div>
                    <Field label={<>عنوان المشكلة<span className="ui-req">*</span></>}>
                      <Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="مثال: لا أستطيع إصدار تذكرة"/>
                    </Field>
                  </div>
                  <div>
                    <Field label="وصف المشكلة">
                      <Textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={5} style={{resize:"none"}}
                        placeholder="اشرح المشكلة بالتفصيل — الخطوات التي أدّت إليها، ما تتوقعه، وما حدث فعلاً..."/>
                    </Field>
                  </div>
                  {/* Attachments */}
                  <div>
                    <div className="ui-label">المرفقات <span style={{fontWeight:400,color:B.muted}}>— اختياري</span></div>
                    {attachments.length<MAX_ATTACHMENTS&&(
                      <label className="flex items-center gap-3 rounded-xl px-4 py-3.5 focus-within:outline focus-within:outline-2"
                        style={{border:`1.5px dashed ${B.borderStrong}`,background:B.fill,outlineColor:B.gold,cursor:uploading?"progress":"pointer",opacity:uploading?0.6:1}}>
                        <span aria-hidden className="flex items-center justify-center flex-shrink-0"
                          style={{width:40,height:40,borderRadius:12,background:B.surface,color:B.text2,border:`1px solid ${B.border}`}}><UploadCloud size={18}/></span>
                        <span className="min-w-0">
                          <span className="block text-sm font-bold" style={{color:B.black}}>{uploading?"جارٍ الرفع…":"أرفق صورةً أو ملف PDF"}</span>
                          <span className="block text-xs mt-0.5" style={{color:B.muted,lineHeight:1.6}}>JPG أو PNG أو WebP أو PDF · حتى {mb(MAX_IMAGE_BYTES)} ميغابايت · {MAX_ATTACHMENTS} كحدّ أقصى</span>
                        </span>
                        <input type="file" accept={ACCEPT} className="sr-only" disabled={uploading} onChange={pickAttachment}/>
                      </label>
                    )}
                    {attachments.length>0&&(
                      <div className="flex flex-wrap gap-2 items-center mt-2.5">
                        {attachments.map((url,i)=>(
                          <div key={i} className="relative rounded-xl overflow-hidden" style={{width:72,height:72,border:`1px solid ${B.border}`,background:B.fill}}>
                            {isPdfUrl(url)
                              ? <div className="w-full h-full flex flex-col items-center justify-center gap-1" style={{color:B.text2}}><FileText size={20}/><span style={{fontSize:12,fontWeight:600}}>PDF</span></div>
                              : <img src={url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>}
                            <button type="button" aria-label="إزالة المرفق" title="إزالة المرفق" onClick={()=>setAttachments(a=>a.filter((_,idx)=>idx!==i))}
                              className="absolute flex items-center justify-center cursor-pointer"
                              style={{top:4,insetInlineEnd:4,width:22,height:22,borderRadius:999,background:B.ink,border:"none",color:B.onInk}}><X size={13}/></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {supportEmail===""&&(
                    <Note tone="warn" icon={<AlertTriangle size={15}/>}>لم يُضبط بريد الدعم الفني في الإعدادات — يُسجَّل الطلب في النظام ولا يُرسَل بريد. اطلب من مدير النظام ضبطه.</Note>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-wrap px-5 py-4" style={{borderTop:`1px solid ${B.border}`}}>
                  <Button variant="primary" icon={<Send size={16}/>} onClick={submit} disabled={!title.trim()||uploading}>
                    {uploading?"انتظر اكتمال رفع المرفق…":"إرسال طلب الدعم"}
                  </Button>
                  <span className="text-xs min-w-0" style={{color:B.muted,lineHeight:1.6}}>
                    {supportEmail===undefined ? "…" : supportEmail
                      ? <>يُرسَل إلى البريد التقني المسجّل في الإعدادات <span dir="ltr" style={{color:B.text2}}>{supportEmail}</span></>
                      : null}
                  </span>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ══════════════ تفاصيل طلب — للفريق ══════════════
   «أضف تعيين طلب الدعم ومحادثة داخلية وسجل حل وإغلاق». التعيين يُكتب في
   الصفّ (upsert_support يُنبّه المعيَّن)، والمحادثة في document_events
   بنوع support، والحلّ نصٌّ إلزامي قبل «تم الحل» و«مغلق» — تحرسه الواجهة
   هنا والقاعدة في الدالة معاً. */
function SupportDetail({ req, users, currentUserId, sla, now, onBack, patch }:{
  req:SupportReq; users:SystemUser[]; currentUserId?:string; sla:SlaConfig; now:number;
  onBack:()=>void; patch:(p:Partial<SupportReq>)=>void;
}) {
  const [evKey,setEvKey]=useState(0); const bump=()=>setEvKey(k=>k+1);
  const [note,setNote]=useState(""); const [saving,setSaving]=useState(false);
  /* الحلّ/الإغلاق لا يُكتبان فور الاختيار: تُطلب صياغة الحلّ أولاً. */
  const [pendingStatus,setPendingStatus]=useState<SupportStatus|null>(null);
  const [resolution,setResolution]=useState(req.resolution??"");
  useEffect(()=>{ setResolution(req.resolution??""); setPendingStatus(null); },[req.id,req.resolution]);

  const activeUsers=users.filter(u=>u.status==="active"&&isUuid(u.id));
  const assignee=users.find(u=>u.id===req.assignedTo);
  const sender=req.createdBy?users.find(u=>u.id===req.createdBy):undefined;
  const promise=replyPromise(sla,req,now);
  const needsResolution=pendingStatus==="resolved"||pendingStatus==="closed";

  function assign(uid:string|null) {
    if((uid??undefined)===req.assignedTo) return;
    const target=uid?users.find(u=>u.id===uid):undefined;
    patch({ assignedTo:uid??undefined, assignedAt:uid?new Date().toISOString():undefined });
    void logDocEvent(SUPPORT_DOC,req.id,"assign",{ note: uid?`أُسند إلى ${target?.name??"موظف"}`:"أُلغي التعيين" }).then(bump);
  }
  function changeStatus(v:SupportStatus) {
    if(v===req.status){ setPendingStatus(null); return; }
    if(v==="resolved"||v==="closed"){ setPendingStatus(v); return; }
    setPendingStatus(null);
    /* الرجوع إلى «مُرسَل» أو «قيد المراجعة» يُعيد فتح الطلب: تواريخ
       الحلّ والإغلاق تُمحى، والنصّ يبقى في السجلّ لا في الصفّ. */
    patch({ status:v, resolvedAt:undefined, closedAt:undefined });
    void logDocEvent(SUPPORT_DOC,req.id,"status",{ note:`→ ${SUP_STATUS_LABELS[v]}` }).then(bump);
  }
  function confirmResolution() {
    if(!pendingStatus) return;
    const text=resolution.trim();
    if(!text){ toast.error("نصّ الحلّ إلزامي قبل الحلّ أو الإغلاق."); return; }
    const at=new Date().toISOString();
    if(pendingStatus==="resolved") patch({ status:"resolved", resolution:text, resolvedAt:at, closedAt:undefined });
    else patch({ status:"closed", resolution:text, resolvedAt:req.resolvedAt??at, closedAt:at });
    void logDocEvent(SUPPORT_DOC,req.id,pendingStatus==="closed"?"close":"status",{ note:`→ ${SUP_STATUS_LABELS[pendingStatus]} — الحلّ: ${text}` }).then(bump);
    setPendingStatus(null);
  }
  async function addNote() {
    const text=note.trim(); if(!text||saving) return;
    setSaving(true);
    const id=await logDocEvent(SUPPORT_DOC,req.id,"note",{ note:text });
    setSaving(false);
    if(id==null&&isSupabaseEnabled){
      toast.error("تعذّر حفظ الملاحظة",{ duration:9000,
        description:"المحادثة الداخلية تحتاج ترحيل 20260913_support_desk.sql (نوع المستند support في سجلّ الأحداث)." });
      return;
    }
    setNote(""); bump();
  }

  const kv=(l:string,v:React.ReactNode)=>(
    <div key={l} className="ts-kv"><span className="ts-kv-k">{l}</span><span className="ts-kv-v">{v||"—"}</span></div>
  );

  return (
    <section className="ui-card">
      <div className="ui-card-head" style={{justifyContent:"flex-start"}}>
        <IconButton variant="outline" label="رجوع إلى النموذج" onClick={onBack}><ArrowRight size={16}/></IconButton>
        <span className="text-xs font-bold" dir="ltr" style={{color:B.muted}}>{req.id}</span>
        <StatusBadge status={req.status} entity="support"/>
        <PrioBadge p={req.priority}/>
      </div>
      <div className="p-5">
      <h2 className="m-0 mb-4" style={{color:B.black,fontSize:17,fontWeight:700,lineHeight:1.5}}>{req.title}</h2>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kv("القسم",req.category)}
        {kv("المُرسِل",sender?.name??(req.createdBy?"موظف":"—"))}
        {kv("أُرسل",fmtWhen(submittedMs(req)))}
        {kv("وعد الردّ",<PromiseLine p={promise}/>)}
      </div>

      <div className="rounded-xl px-4 py-3 mt-4 text-sm whitespace-pre-line" style={{background:B.fill,color:req.desc?B.text3:B.muted,lineHeight:1.8}}>
        {req.desc||"بلا وصف"}
      </div>

      {!!req.attachments?.length&&(
        <div className="mt-4">
          <div className="ui-label flex items-center gap-1"><Paperclip size={13}/>المرفقات ({req.attachments.length})</div>
          <div className="flex flex-wrap gap-2">
            {req.attachments.map((url,i)=>(
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" title="فتح المرفق في تبويب جديد"
                className="rounded-xl overflow-hidden flex items-center justify-center" style={{width:88,height:88,border:`1px solid ${B.border}`,background:B.fill,color:B.text2}}>
                {isPdfUrl(url)
                  ? <span className="flex flex-col items-center gap-1"><FileText size={22}/><span style={{fontSize:12,fontWeight:600}}>PDF</span></span>
                  : <img src={url} alt={`مرفق ${i+1}`} style={{width:"100%",height:"100%",objectFit:"cover"}}/>}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4 mt-5 pt-5" style={{borderTop:`1px solid ${B.border}`}}>
        {/* ── المسؤول ── */}
        <div>
          <span className="ui-label">الموظف المسؤول</span>
          <AppSelect value={req.assignedTo??""} placeholder="غير معيَّن" onChange={v=>assign(v||null)} ariaLabel="الموظف المسؤول"
            options={[{value:"",label:"— بلا مسؤول —"},...activeUsers.map(u=>({value:u.id,label:u.name}))]}/>
          <div className="flex items-center justify-between gap-2 flex-wrap mt-2">
            {currentUserId&&req.assignedTo!==currentUserId&&(
              <button type="button" onClick={()=>assign(currentUserId)} className="ui-btn ui-btn--link" style={{fontSize:13}}>أسنده إليّ</button>
            )}
            {req.assignedTo&&(
              <span className="text-xs" style={{color:B.muted}}>
                مُسنَد إلى <b style={{color:B.text2,fontWeight:600}}>{assignee?.name??"موظف"}</b>
                {req.assignedAt&&<> منذ {fmtWhen(Date.parse(req.assignedAt))}</>}
              </span>
            )}
          </div>
          {activeUsers.length===0&&<div className="ui-hint" style={{color:TONE.warn.fg}}>لا حسابات موظفين نشطة مرتبطة بملفٍ — أنشئها من شاشة المستخدمين.</div>}
        </div>

        {/* ── الحالة والحلّ ── */}
        <div>
          <span className="ui-label">حالة الطلب</span>
          <AppSelect value={pendingStatus??req.status} onChange={v=>changeStatus(v as SupportStatus)} ariaLabel="حالة الطلب"
            options={SUP_STATUSES.map(s=>({value:s,label:supLabel(s)}))}/>
          {!needsResolution&&(req.status==="resolved"||req.status==="closed")&&(
            <div className="text-xs mt-2" style={{color:B.text2,lineHeight:1.7}}>
              {req.resolution
                ? <><b style={{color:B.text3,fontWeight:600}}>الحلّ:</b> <span className="whitespace-pre-line">{req.resolution}</span></>
                : <span style={{color:TONE.warn.fg}}>طلبٌ قديم بلا نصّ حلّ — يُستكمل عند أوّل تعديل.</span>}
              {req.resolvedAt&&<div className="mt-1" style={{color:B.muted}}>حُلّ: {fmtWhen(Date.parse(req.resolvedAt))}
                {req.closedAt&&<> · أُغلق: {fmtWhen(Date.parse(req.closedAt))}</>}</div>}
            </div>
          )}
        </div>
      </div>
      {needsResolution&&(
        <div className="rounded-xl p-4 mt-4" style={{background:B.fill}}>
          <Field label={<>{pendingStatus==="closed"?"نصّ الحلّ قبل الإغلاق":"نصّ الحلّ"}<span className="ui-req">*</span></>}
            hint="يُحفظ في الطلب ويُسجَّل في المحادثة — من يفتح الطلب بعد شهر يعرف ما حُلّ وكيف.">
            <Textarea value={resolution} onChange={e=>setResolution(e.target.value)} rows={3} style={{resize:"none"}}
              placeholder="ما الذي كان سبب المشكلة، وما الذي فُعل لحلّها؟"/>
          </Field>
          <div className="flex gap-2 mt-3">
            <Button variant="primary" onClick={confirmResolution} disabled={!resolution.trim()}>
              {pendingStatus==="closed"?"تأكيد الإغلاق":"تأكيد الحلّ"}
            </Button>
            <Button variant="secondary" onClick={()=>{ setPendingStatus(null); setResolution(req.resolution??""); }}>تراجع</Button>
          </div>
        </div>
      )}

      {/* ── المحادثة الداخلية ── */}
      <div className="mt-5 pt-5" style={{borderTop:`1px solid ${B.border}`}}>
        <label className="ui-label flex items-center gap-1.5 flex-wrap" htmlFor={`sup-note-${req.id}`}>
          <MessageSquare size={14}/>المحادثة الداخلية
          <span style={{fontWeight:400,color:B.muted}}>— بين أفراد الفريق، وتُسجَّل باسم كاتبها ووقتها</span>
        </label>
        <div className="flex gap-2 items-end">
          <Textarea id={`sup-note-${req.id}`} value={note} onChange={e=>setNote(e.target.value)} rows={2} style={{resize:"none",minHeight:64}}
            placeholder="ملاحظة للفريق: ما جُرّب، ما يُنتظر، من يُتابع…"
            onKeyDown={e=>{ if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)) void addNote(); }}/>
          {/* داكنٌ لا ذهبي: الذهبي في هذه اللوحة لتأكيد الحلّ وحده. */}
          <Button variant="dark" onClick={addNote} disabled={!note.trim()} loading={saving} icon={<Send size={15}/>}
            title="إضافة ملاحظة (Ctrl+Enter)">إضافة</Button>
        </div>
        {!isSupabaseEnabled&&<div className="ui-hint">في وضع التجربة لا تُحفظ المحادثة — تحتاج اتصالاً بالقاعدة.</div>}
      </div>
      <div className="mt-5">
        <EventTimeline flat docType={SUPPORT_DOC} docId={req.id} title="المحادثة وسجلّ الطلب" reloadKey={evKey}
          emptyText="لا ملاحظات بعد — أوّل ملاحظة تبدأ المحادثة، والتعيين والانتقالات تُسجَّل هنا تلقائياً."/>
      </div>
      </div>
    </section>
  );
}
