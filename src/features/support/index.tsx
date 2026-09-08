import { useEffect, useState } from "react";
import {
  X, ImagePlus, FileText, Clock, CheckCircle2, UserCheck, MessageSquare,
  ArrowRight, Paperclip, Copy, AlertTriangle, Send,
} from "lucide-react";
import { toast } from "sonner";
import { B } from "@/lib/theme";
import { EntityGate } from "@/components/States";
import type { SupportPriority, SupportStatus, SupportReq, SystemUser } from "@/types";
import { PageHeader } from "@/components/PageHeader";
import { AppSelect } from "@/components/AppSelect";
import { Field } from "@/components/Field";
import { EventTimeline } from "@/components/EventTimeline";
import { useStore } from "@/store/useStore";
import { newId } from "@/lib/utils";
import { uploadMedia, MAX_IMAGE_BYTES, MEDIA_BUCKET, MediaError, takeFile } from "@/lib/mediaUpload";
import { supabase, isSupabaseEnabled } from "@/supabase/client";
import { fetchSettings } from "@/data/settings";
import { configureSla, currentSla, slaDueAt, isOpenAt, type SlaConfig } from "@/features/customer/sla";
import { logDocEvent, type DocType } from "@/features/docs/docEvents";

const SUPPORT_CATS = ["عام","تقني — أخطاء في النظام","مالي — فواتير وتحصيل","محتوى — تعديل النصوص","باقات ورحلات","حجوزات وتذاكر","طلب ميزة جديدة"];

const PRIO_MAP:Record<SupportPriority,{bg:string;fg:string;border:string}> = {
  "عاجل":   {bg:"#FBE6E6",fg:"#BE2626",border:"#F3C9C9"},
  "متوسط":  {bg:"#FBF3D6",fg:"#8A6A08",border:"#F0E3AE"},
  "منخفض":  {bg:"#E3F3E8",fg:"#1E7A44",border:"#C4E4CE"},
};

const STATUS_LEGEND:[string,string][] = [
  ["مُرسَل","تم إرسال الطلب وهو في انتظار المراجعة من الفريق التقني"],
  ["قيد المراجعة","يعمل الفريق على دراسة الطلب وإيجاد حل مناسب"],
  ["تم الحل","تم معالجة الطلب — يُرجى التحقق من الحل وإبلاغنا"],
  ["مغلق","تم إغلاق الطلب بعد التأكيد من الطرفين"],
];

const SUP_STATUSES:SupportStatus[] = ["sent","reviewing","resolved","closed"];
const SUP_STATUS_LABELS:Record<SupportStatus,string> = {sent:"مُرسَل",reviewing:"قيد المراجعة",resolved:"تم الحل",closed:"مغلق"};
const SUP_STATUS_COLORS:Record<SupportStatus,{bg:string;fg:string}> = {
  sent:     {bg:"#EAF1FE",fg:"#1E52C7"},
  reviewing:{bg:"#FBF3D6",fg:"#8A6A08"},
  resolved: {bg:"#E3F3E8",fg:"#1E7A44"},
  closed:   {bg:"#EEECEA",fg:"#5C554E"},
};

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

const fmtWhen = (ms:number):string =>
  new Date(ms).toLocaleString("ar-SA-u-nu-latn", { dateStyle:"medium", timeStyle:"short", timeZone:"Asia/Riyadh" });

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
    return <span className="text-xs inline-flex items-center gap-1" style={{color:"#1E7A44"}}>
      <CheckCircle2 size={11}/>تم الردّ{p.at != null && <> · <span style={{fontFamily:"var(--font-app)"}}>{fmtWhen(p.at)}</span></>}
    </span>;
  }
  const overdue = p.kind === "overdue";
  return <span className="text-xs inline-flex items-center gap-1 font-bold" style={{color: overdue ? "#BE2626" : B.text2}}>
    {overdue ? <AlertTriangle size={11}/> : <Clock size={11}/>}
    {overdue ? "متأخّر عن الوعد" : "الردّ قبل"} <span style={{fontFamily:"var(--font-app)", fontWeight:600}}>{fmtWhen(p.due)}</span>
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

  const q=search.trim();
  const visible = q ? reqs.filter(r=>r.id.includes(q)||r.title.includes(q)||r.category.includes(q)) : reqs;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background:B.bg}}>
      <PageHeader title="الدعم الفني" crumb="إرسال طلب دعم" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>
      <main className="flex-1 px-4 md:px-8 py-6 max-w-5xl">
        {/* ── بيانات المُرسِل ──
            كانت أربع قيم مكتوبة في الشفرة: «سالم أحمد» و«مدير النظام»
            و0501234567 وsalem@tasahheel.com — تُعرض لكل من يفتح الشاشة
            مهما كان. يوسف يفتحها فيقرأ بيانات سالم، ويرسل طلباً منسوباً
            إلى شخصٍ آخر. الآن من الجلسة الفعلية (profiles + auth).

            وما لا تعرفه الجلسة يُقال «—» صراحةً: قيمةٌ مخترعة في حقل
            هوية أسوأ من فراغٍ معلَن. */}
        <div className="rounded-2xl px-6 py-5 mb-6" style={{background:B.primary}}>
          <div className="text-xs font-bold mb-3" style={{color:"#9DBAB6"}}>بيانات المُرسِل (من حسابك)</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {sender.map(f=>(
              <div key={f.l}>
                <div className="text-xs mb-0.5" style={{color:"#9DBAB6",fontWeight:600}}>{f.l}</div>
                <div className="font-bold text-sm" style={{color:"#F0E6CC"}}>{f.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 flex flex-col gap-6">
            {/* ── ما بعد الإرسال: رقم التذكرة وموعد الردّ ── */}
            {lastSent&&(
              <div role="status" className="rounded-2xl p-5" style={{background:"#E3F3E8",border:"1px solid #C4E4CE"}}>
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:"#fff"}}>
                    <CheckCircle2 size={20} style={{color:"#1E7A44"}}/>
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-extrabold text-base" style={{color:"#1E7A44"}}>تم إرسال الطلب</div>
                      <button aria-label="إغلاق" title="إغلاق" onClick={()=>setLastSent(null)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer" style={{background:"transparent",border:"none",color:B.text2}}><X size={14}/></button>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4 mt-3">
                      <div>
                        <div className="text-xs font-bold mb-1" style={{color:B.text3}}>رقم التذكرة</div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-extrabold text-lg" dir="ltr" style={{color:B.black}}>{lastSent.id}</span>
                          <button aria-label="نسخ رقم التذكرة" title="نسخ رقم التذكرة"
                            onClick={()=>{ navigator.clipboard?.writeText(lastSent.id).then(()=>toast.success("نُسخ رقم التذكرة")).catch(()=>{}); }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer" style={{background:"#fff",border:`1px solid ${B.border}`,color:B.text2}}><Copy size={12}/></button>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-bold mb-1" style={{color:B.text3}}>الردّ المتوقّع قبل</div>
                        <div className="font-bold text-sm" style={{color:B.black,fontFamily:"var(--font-app)"}}>{lastSent.dueAt!=null?fmtWhen(lastSent.dueAt):"—"}</div>
                        <div className="text-xs mt-0.5" style={{color:B.muted}}>
                          خلال {hoursLabel(sla.slaHours)} · الدوام <span dir="ltr" style={{fontFamily:"var(--font-app)"}}>{sla.openHour}:00–{sla.closeHour}:00</span> بتوقيت الرياض
                        </div>
                      </div>
                    </div>
                    {lastSent.afterHours&&(
                      <div className="text-xs mt-3 px-3 py-2 rounded-lg" style={{background:"#FBF3D6",color:"#8A6A08"}}>
                        أُرسل خارج ساعات العمل — يبدأ احتساب الوعد من فتح المكتب في أوّل يوم عملٍ قادم.
                      </div>
                    )}
                    <div className="flex gap-2 mt-3">
                      <button onClick={()=>follow(lastSent.id)}
                        className="px-4 py-2 rounded-xl font-bold text-sm cursor-pointer" style={{background:B.primary,color:B.cream,border:"none"}}>متابعة الطلب</button>
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
              <div className="rounded-2xl p-6" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                <div className="font-extrabold text-base mb-5" style={{color:B.black,fontFamily:"var(--font-app)"}}>نموذج إرسال الطلب</div>
                <div className="flex flex-col gap-4">
                  <div>
                    <Field label="القسم">
                      <AppSelect value={category} onChange={setCategory} options={SUPPORT_CATS.map(c=>({value:c,label:c}))}/>
                    </Field>
                  </div>
                  <div>
                    <Field label="عنوان المشكلة">
                      <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="مثال: لا أستطيع إصدار تذكرة"
                        className="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border,fontFamily:"inherit"}}/>
                    </Field>
                  </div>
                  <div>
                    <Field label="وصف المشكلة">
                      <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={5}
                        placeholder="اشرح المشكلة بالتفصيل — الخطوات التي أدّت إليها، ما تتوقعه، وما حدث فعلاً..."
                        className="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none resize-none" style={{borderColor:B.border,fontFamily:"inherit"}}/>
                    </Field>
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-2" style={{color:B.text3}}>أولوية الطلب</label>
                    <div className="flex gap-2">
                      {(["عاجل","متوسط","منخفض"] as SupportPriority[]).map(p=>{
                        const pm=PRIO_MAP[p];
                        const active=priority===p;
                        return (
                          <button key={p} type="button" onClick={()=>setPriority(p)}
                            className="flex-1 py-2.5 rounded-xl font-bold text-sm cursor-pointer transition-all"
                            style={{border:`1px solid ${active?pm.border:B.border}`,background:active?pm.bg:"#fff",color:active?pm.fg:B.text2}}>
                            {p}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* Attachments */}
                  <div>
                    <label className="block text-xs font-bold mb-2" style={{color:B.text3}}>
                      المرفقات <span className="font-normal" style={{color:B.muted}}>(اختياري — صورة JPG/PNG/WebP أو PDF، حتى {mb(MAX_IMAGE_BYTES)} ميغابايت، {MAX_ATTACHMENTS} كحدّ أقصى)</span>
                    </label>
                    <div className="flex flex-wrap gap-2 items-center">
                      {attachments.map((url,i)=>(
                        <div key={i} className="relative rounded-xl overflow-hidden" style={{width:72,height:72,border:`1px solid ${B.border}`,background:B.bg}}>
                          {isPdfUrl(url)
                            ? <div className="w-full h-full flex flex-col items-center justify-center gap-1" style={{color:B.text2}}><FileText size={20}/><span style={{fontSize:9,fontWeight:700}}>PDF</span></div>
                            : <img src={url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>}
                          <button aria-label="إزالة المرفق" title="إزالة المرفق" onClick={()=>setAttachments(a=>a.filter((_,idx)=>idx!==i))} className="absolute top-0.5 left-0.5 w-5 h-5 rounded-md flex items-center justify-center cursor-pointer" style={{background:"rgba(190,38,38,0.92)",border:"none",color:"#fff"}}><X size={11}/></button>
                        </div>
                      ))}
                      {attachments.length<MAX_ATTACHMENTS&&(
                        <label className="flex flex-col items-center justify-center gap-1 rounded-xl" style={{width:72,height:72,border:`1.5px dashed ${B.border}`,background:B.bg,color:B.muted,cursor:uploading?"progress":"pointer",opacity:uploading?0.6:1}}>
                          <ImagePlus size={18}/><span style={{fontSize:9,fontWeight:700}}>{uploading?"جارٍ الرفع…":"إرفاق"}</span>
                          <input type="file" accept={ACCEPT} className="hidden" disabled={uploading} onChange={pickAttachment}/>
                        </label>
                      )}
                    </div>
                  </div>
                  {/* Submit */}
                  <button onClick={submit} disabled={!title.trim()||uploading}
                    className="w-full py-3 rounded-xl font-extrabold text-base cursor-pointer transition-all"
                    style={{background:title.trim()&&!uploading?B.gold:"#D8D0C4",color:title.trim()&&!uploading?B.black:"#9a9186",border:"none"}}>
                    {uploading?"انتظر اكتمال رفع المرفق…":"إرسال طلب الدعم"}
                  </button>
                  <div className="text-xs text-center" style={{color:supportEmail===""?"#8A6A08":B.muted}}>
                    {supportEmail===undefined
                      ? "…"
                      : supportEmail
                        ? <>سيتم إرسال الطلب إلى البريد التقني المسجّل في إعدادات النظام
                            {" "}<span style={{fontFamily:"var(--font-app)",color:B.text2}}>{supportEmail}</span></>
                        : "لم يُضبط بريد الدعم الفني في الإعدادات — يُسجَّل الطلب في النظام ولا يُرسَل بريد. اطلب من مدير النظام ضبطه."}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Sidebar: legend + history ── */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {/* Status legend */}
            <div className="rounded-2xl p-5" style={{background:B.cream,border:`1px solid #EDE4CF`}}>
              <div className="font-extrabold text-sm mb-4" style={{color:B.black}}>حالات طلب الدعم</div>
              <div className="flex flex-col gap-3">
                {STATUS_LEGEND.map(([k,v])=>(
                  <div key={k} className="flex gap-3 items-start">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0" style={{background:"#fff",border:`1px solid ${B.border}`,color:B.text3}}>{k}</span>
                    <span className="text-xs leading-relaxed" style={{color:B.text2}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* ── الطلبات السابقة — من جدول support عبر المخزن، لا قائمة ثابتة ──
                كل بطاقة تحمل حالتها وتاريخها ووعد ردّها: «متأخّر عن الوعد»
                يُقرأ من القائمة قبل أن يُفتح الطلب. */}
            <div className="rounded-2xl p-5" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <div className="flex items-center justify-between mb-4">
                <div className="font-extrabold text-sm" style={{color:B.black}}>الطلبات السابقة</div>
                <span className="text-xs font-bold" style={{color:B.muted}}>{visible.length}{q&&reqs.length!==visible.length?` من ${reqs.length}`:""}</span>
              </div>
              <EntityGate entity="support" label="طلبات الدعم" cols={3} rows={3}>
              <div className="flex flex-col gap-3">
                {visible.map(r=>{
                  const sc=SUP_STATUS_COLORS[r.status];
                  const pm=PRIO_MAP[r.priority];
                  const isOpen=openId===r.id, lit=highlightId===r.id;
                  const assignee=r.assignedTo?users.find(u=>u.id===r.assignedTo):undefined;
                  return (
                    <button key={r.id} id={`sup-${r.id}`} type="button" onClick={()=>setOpenId(isOpen?null:r.id)}
                      aria-pressed={isOpen} aria-label={`فتح الطلب ${r.id}`}
                      className="rounded-xl p-3 text-right cursor-pointer w-full"
                      style={{border:`1px solid ${isOpen?B.primary:B.border}`,background:lit?B.cream:isOpen?"#F3F8F7":"#fff",
                              boxShadow:lit?`0 0 0 3px ${B.gold2}`:"none",transition:"box-shadow .3s, background .3s",fontFamily:"inherit"}}>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-mono text-xs font-bold" dir="ltr" style={{color:B.muted}}>{r.id}</span>
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full" style={{background:sc.bg,color:sc.fg}}>{SUP_STATUS_LABELS[r.status]}</span>
                      </div>
                      <div className="font-bold text-sm mb-2" style={{color:B.black}}>{r.title}</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs" style={{color:B.muted}}>{r.category.split("—")[0].trim()}</span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded" style={{background:pm.bg,color:pm.fg}}>{r.priority}</span>
                        {!!r.attachments?.length&&<span className="text-xs inline-flex items-center gap-0.5" style={{color:B.muted}}><Paperclip size={10}/>{r.attachments.length}</span>}
                        <span className="text-xs font-mono mr-auto" dir="ltr" style={{color:B.muted}}>{r.date}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-2 pt-2 flex-wrap" style={{borderTop:`1px dashed ${B.border}`}}>
                        <PromiseLine p={replyPromise(sla,r,now)}/>
                        {assignee&&<span className="text-xs inline-flex items-center gap-1" style={{color:"#7226BE"}}><UserCheck size={11}/>{assignee.name}</span>}
                      </div>
                    </button>
                  );
                })}
                {visible.length===0&&<p className="text-sm text-center py-4" style={{color:B.muted}}>{q?"لا طلب يطابق البحث":"لا توجد طلبات سابقة"}</p>}
              </div>
              </EntityGate>
            </div>
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
  const sc=SUP_STATUS_COLORS[req.status]; const pm=PRIO_MAP[req.priority];
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

  const row=(icon:React.ReactNode,l:string,v:React.ReactNode)=>(
    <div key={l} className="flex items-start gap-2 py-2" style={{borderBottom:`1px solid ${B.border}`}}>
      <span style={{color:B.muted,marginTop:2}}>{icon}</span>
      <span className="text-xs font-semibold" style={{color:B.muted,minWidth:88}}>{l}</span>
      <span className="text-sm font-bold flex-1" style={{color:B.black}}>{v||"—"}</span>
    </div>
  );
  const inp="w-full rounded-xl border px-3 py-2.5 text-sm resize-none focus:outline-none";
  const ist={borderColor:B.border,fontFamily:"inherit",color:B.black} as const;

  return (
    <div className="rounded-2xl p-6" style={{background:"#fff",border:`1px solid ${B.border}`}}>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} aria-label="رجوع إلى النموذج" title="رجوع إلى النموذج"
          className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0" style={{background:B.bg,border:`1px solid ${B.border}`,color:B.text2}}><ArrowRight size={16}/></button>
        <span className="font-mono text-xs font-bold" dir="ltr" style={{color:B.muted}}>{req.id}</span>
        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full" style={{background:sc.bg,color:sc.fg}}>{SUP_STATUS_LABELS[req.status]}</span>
        <span className="text-xs font-bold px-2 py-0.5 rounded" style={{background:pm.bg,color:pm.fg}}>{req.priority}</span>
      </div>
      <h2 className="text-lg font-extrabold m-0 mb-3" style={{color:B.black}}>{req.title}</h2>

      <div className="flex flex-col">
        {row(<FileText size={13}/>,"القسم",req.category)}
        {row(<UserCheck size={13}/>,"المُرسِل",sender?.name??(req.createdBy?"موظف":"—"))}
        {row(<Send size={13}/>,"أُرسل",<span style={{fontFamily:"var(--font-app)",fontWeight:600}}>{fmtWhen(submittedMs(req))}</span>)}
        {row(<Clock size={13}/>,"وعد الردّ",<PromiseLine p={promise}/>)}
      </div>

      <div className="rounded-xl px-4 py-3 mt-4 text-sm whitespace-pre-line" style={{background:B.bg,border:`1px solid ${B.border}`,color:req.desc?B.text3:B.muted}}>
        {req.desc||"بلا وصف"}
      </div>

      {!!req.attachments?.length&&(
        <div className="mt-4">
          <div className="text-xs font-bold mb-2 flex items-center gap-1" style={{color:B.text3}}><Paperclip size={12}/>المرفقات ({req.attachments.length})</div>
          <div className="flex flex-wrap gap-2">
            {req.attachments.map((url,i)=>(
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" title="فتح المرفق في تبويب جديد"
                className="rounded-xl overflow-hidden flex items-center justify-center" style={{width:88,height:88,border:`1px solid ${B.border}`,background:B.bg,color:B.text2}}>
                {isPdfUrl(url)
                  ? <span className="flex flex-col items-center gap-1"><FileText size={22}/><span style={{fontSize:10,fontWeight:700}}>PDF</span></span>
                  : <img src={url} alt={`مرفق ${i+1}`} style={{width:"100%",height:"100%",objectFit:"cover"}}/>}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ── المسؤول ── */}
      <div className="rounded-xl p-4 mt-5 flex flex-col gap-2" style={{background:B.bg,border:`1px solid ${B.border}`}}>
        <div className="flex items-center gap-2 text-xs font-bold" style={{color:B.text3}}><UserCheck size={13}/>الموظف المسؤول</div>
        <AppSelect value={req.assignedTo??""} placeholder="غير معيَّن" onChange={v=>assign(v||null)} ariaLabel="الموظف المسؤول"
          options={[{value:"",label:"— بلا مسؤول —"},...activeUsers.map(u=>({value:u.id,label:u.name}))]}/>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {currentUserId&&req.assignedTo!==currentUserId&&(
            <button onClick={()=>assign(currentUserId)} className="text-xs font-bold cursor-pointer" style={{background:"none",border:"none",color:B.primary,padding:0}}>أسنده إليّ</button>
          )}
          {req.assignedTo&&(
            <span className="text-xs" style={{color:B.muted}}>
              مُسنَد إلى <b style={{color:B.text2}}>{assignee?.name??"موظف"}</b>
              {req.assignedAt&&<> منذ <span style={{fontFamily:"var(--font-app)"}}>{fmtWhen(Date.parse(req.assignedAt))}</span></>}
            </span>
          )}
        </div>
        {activeUsers.length===0&&<div className="text-xs" style={{color:"#8A6A08"}}>لا حسابات موظفين نشطة مرتبطة بملفٍ — أنشئها من شاشة المستخدمين.</div>}
      </div>

      {/* ── الحالة والحلّ ── */}
      <div className="rounded-xl p-4 mt-4 flex flex-col gap-2" style={{background:B.bg,border:`1px solid ${B.border}`}}>
        <div className="text-xs font-bold" style={{color:B.text3}}>حالة الطلب</div>
        <AppSelect value={pendingStatus??req.status} onChange={v=>changeStatus(v as SupportStatus)} ariaLabel="حالة الطلب"
          options={SUP_STATUSES.map(s=>({value:s,label:SUP_STATUS_LABELS[s]}))}/>
        {needsResolution&&(
          <div className="rounded-xl p-3 mt-1 flex flex-col gap-2" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <Field label={pendingStatus==="closed"?"نصّ الحلّ قبل الإغلاق (إلزامي)":"نصّ الحلّ (إلزامي)"}
              hint="يُحفظ في الطلب ويُسجَّل في المحادثة — من يفتح الطلب بعد شهر يعرف ما حُلّ وكيف.">
              <textarea value={resolution} onChange={e=>setResolution(e.target.value)} rows={3} className={inp} style={ist}
                placeholder="ما الذي كان سبب المشكلة، وما الذي فُعل لحلّها؟"/>
            </Field>
            <div className="flex gap-2">
              <button onClick={confirmResolution} disabled={!resolution.trim()}
                className="px-4 py-2 rounded-xl font-bold text-sm cursor-pointer"
                style={{background:resolution.trim()?B.gold:"#D8D0C4",color:resolution.trim()?B.black:"#9a9186",border:"none"}}>
                {pendingStatus==="closed"?"تأكيد الإغلاق":"تأكيد الحلّ"}
              </button>
              <button onClick={()=>{ setPendingStatus(null); setResolution(req.resolution??""); }}
                className="px-4 py-2 rounded-xl font-bold text-sm cursor-pointer" style={{background:"#fff",border:`1px solid ${B.border}`,color:B.text2}}>تراجع</button>
            </div>
          </div>
        )}
        {!needsResolution&&(req.status==="resolved"||req.status==="closed")&&(
          <div className="text-xs leading-relaxed" style={{color:B.text2}}>
            {req.resolution
              ? <><b style={{color:B.text3}}>الحلّ:</b> <span className="whitespace-pre-line">{req.resolution}</span></>
              : <span style={{color:"#8A6A08"}}>طلبٌ قديم بلا نصّ حلّ — يُستكمل عند أوّل تعديل.</span>}
            {req.resolvedAt&&<div className="mt-1" style={{color:B.muted}}>حُلّ: <span style={{fontFamily:"var(--font-app)"}}>{fmtWhen(Date.parse(req.resolvedAt))}</span>
              {req.closedAt&&<> · أُغلق: <span style={{fontFamily:"var(--font-app)"}}>{fmtWhen(Date.parse(req.closedAt))}</span></>}</div>}
          </div>
        )}
      </div>

      {/* ── المحادثة الداخلية ── */}
      <div className="mt-5">
        <div className="flex items-center gap-2 text-xs font-bold mb-2" style={{color:B.text3}}>
          <MessageSquare size={13}/>المحادثة الداخلية
          <span className="font-normal" style={{color:B.muted}}>— بين أفراد الفريق، وتُسجَّل باسم كاتبها ووقتها</span>
        </div>
        <div className="flex gap-2 items-start">
          <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} className={inp} style={ist}
            placeholder="ملاحظة للفريق: ما جُرّب، ما يُنتظر، من يُتابع…"
            onKeyDown={e=>{ if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)) void addNote(); }}/>
          <button onClick={addNote} disabled={!note.trim()||saving} aria-label="إضافة ملاحظة" title="إضافة ملاحظة (Ctrl+Enter)"
            className="w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0"
            style={{background:note.trim()&&!saving?B.primary:"#D8D0C4",color:note.trim()&&!saving?B.cream:"#9a9186",border:"none"}}>
            <Send size={15}/>
          </button>
        </div>
        {!isSupabaseEnabled&&<div className="text-xs mt-1" style={{color:B.muted}}>في وضع التجربة لا تُحفظ المحادثة — تحتاج اتصالاً بالقاعدة.</div>}
      </div>
      <div className="mt-4">
        <EventTimeline docType={SUPPORT_DOC} docId={req.id} title="المحادثة وسجلّ الطلب" reloadKey={evKey}
          emptyText="لا ملاحظات بعد — أوّل ملاحظة تبدأ المحادثة، والتعيين والانتقالات تُسجَّل هنا تلقائياً."/>
      </div>
    </div>
  );
}
