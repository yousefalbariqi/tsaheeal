import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Eye, SearchX, Ticket } from "lucide-react";
import { B, ELEV, SCRIM, type ToneName } from "@/lib/theme";
import { useDebounced } from "@/lib/useDebounced";
import { useDialogA11y } from "@/lib/useDialogA11y";
import type { TicketEntry } from "@/types";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { useStore } from "@/store/useStore";
import { Pager, usePaged, type Paged } from "@/components/Pager";
import { useServerPagedSearch } from "@/lib/useServerSearch";
import { sar } from "@/lib/money";
import { fmtDateShort, fmtTime } from "@/lib/dates";
import { EntityGate, EmptyState } from "@/components/States";
import { OrgLine } from "@/components/OrgLine";
import { QRBlock } from "@/components/QRBlock";
import { invVerifyUrl } from "@/lib/utils";
import { DocActions } from "@/features/docs/DocActions";
import { ticketPhase, TICKET_PHASE_LABEL, TICKET_PHASE_TONE, docFileName } from "@/lib/docPhase";
import type { TicketPhase } from "@/types";
import { Badge, Button, FilterChips, IconButton, SortTh, useSort, type ChipOption } from "@/components/ui";

/* لون الطور في القائمة من ألوان المعنى في اللوحة (TONE). الورقة المطبوعة
   تبقى على ألوان lib/docPhase كما هي. */
const PHASE_TONE: Record<TicketPhase, ToneName> = { valid:"success", used:"info", cancelled:"danger", expired:"neutral" };
const PhaseBadge = ({t}:{t:TicketEntry}) => { const ph=ticketPhase(t); return <Badge dot tone={PHASE_TONE[ph]}>{TICKET_PHASE_LABEL[ph]}</Badge>; };
const PHASES: TicketPhase[] = ["valid","used","expired","cancelled"];

/* مفاتيح الفرز — للقائمة المحلية وحدها؛ بحث القاعدة يرتّب صفحته بنفسه. */
type SortKey = "no"|"client"|"pkg"|"persons"|"trip"|"phase";
const SORT_GET: Record<SortKey,(t:TicketEntry)=>string|number|null|undefined> = {
  no: t=>t.ticketNo, client: t=>t.clientName, pkg: t=>t.packageName, persons: t=>t.persons,
  trip: t=>`${t.tripDate} ${t.tripTime}`, phase: t=>TICKET_PHASE_LABEL[ticketPhase(t)],
};

/* ─── Ticket Print View ─── */
export function TicketCard({ticket,autoPrint,onClose}:{ticket:TicketEntry;autoPrint?:boolean;onClose:()=>void}) {
  /* الرحلة والفرع من المخزن: جدول tickets يحمل `departure_point` نصّاً
     منسوخاً لحظة الإصدار ولا يحمل معرّف فرع. الوصول إليه عبر الحجز →
     الرحلة → الفرع. وكلّها في المخزن أصلاً فلا طلب إضافي. */
  const trips    = useStore(s=>s.trips);
  const branches = useStore(s=>s.branches);
  const bookings = useStore(s=>s.bookings);
  const phase = ticketPhase(ticket);
  const phaseTone = TICKET_PHASE_TONE[phase];

  const origin = useMemo(()=>{
    const bk = bookings.find(b=>b.id===ticket.bookingId);
    const tr = trips.find(t=>t.id===bk?.tripId);
    const br = branches.find(x=>x.id===tr?.branchId);
    const free = (ticket.departurePoint||"").trim();
    if (br) {
      return {
        title: br.name,
        /* النصّ الحرّ يبقى تفصيلاً تحت اسم الفرع ما لم يكن تكراراً له. */
        detail: [ [br.address,br.city].map(x=>(x||"").trim()).filter(Boolean).join("، "),
                  free && free!==br.name ? free : "" ].filter(Boolean).join(" — "),
        mapUrl: br.gmapUrl || tr?.departureMapUrl || "",
      };
    }
    /* بلا فرع مرتبط: النصّ الحرّ هو كل ما نملك — يُعرض ولا يُخترع غيره. */
    return { title: free, detail: "", mapUrl: tr?.departureMapUrl || "" };
  },[ticket.bookingId,ticket.departurePoint,bookings,trips,branches]);

  /* geometric tile SVG as data URL */
  const geoBg = `repeating-linear-gradient(45deg,rgba(192,134,44,.06) 0px,rgba(192,134,44,.06) 1px,transparent 1px,transparent 22px),repeating-linear-gradient(-45deg,rgba(192,134,44,.06) 0px,rgba(192,134,44,.06) 1px,transparent 1px,transparent 22px)`;
  /* ليست <Modal> المشتركة لسبب الفاتورة نفسه (features/payments): قاعدة
     الطباعة تُثبّت الورقة على أقرب سلفٍ متموضع، وهو هذه الخلفية بعرض
     الصفحة؛ داخل `.ui-modal` كانت ستُقصّ. البنية باقية والمظهر موحَّد. */
  const a11y = useDialogA11y({ open:true, onClose });
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="ts-admin fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-4 overflow-auto" dir="rtl"
      style={{background:SCRIM}}>
      <div ref={a11y.ref} {...a11y.panelProps} aria-label={`تذكرة ${ticket.ticketNo}`}
        className="w-full max-w-2xl flex flex-col gap-3 my-2 sm:my-4" style={{outline:"none"}} onClick={e=>e.stopPropagation()}>
        {/* نطاق الطباعة — كان ناقصاً هنا وحده: زرّ «طباعة» في التذكرة
            يطبع الصفحة كلها (القائمة الجانبية والجدول خلف النافذة) لا
            التذكرة. نفس القاعدة المستعملة في الفاتورة. */}
        <style>{`@media print{ body *{visibility:hidden !important;} #ticket-sheet, #ticket-sheet *{visibility:visible !important;} #ticket-sheet{position:absolute !important;inset:0 !important;margin:0 !important;max-width:none !important;box-shadow:none !important;border-radius:0 !important;} }`}</style>
        {/* شريط الإجراءات — نفسه المستعمل في الفاتورة.
            كان هنا زرّ «إغلاق» وحده: لا طباعة ولا تنزيل ولا إرسال. */}
        <DocActions
          docType="ticket" docId={ticket.ticketNo} autoPrint={autoPrint}
          fileName={docFileName("ticket", ticket.ticketNo, ticket.clientName)}
          whatsapp={{
            phone: ticket.clientPhone,
            text: `مرحباً ${ticket.clientName}،\nتذكرة تساهيل العمرة رقم ${ticket.ticketNo}\nالرحلة: ${ticket.tripDate} · ${ticket.tripTime}\nنقطة الانطلاق: ${origin.title}\nرابط التحقق: ${invVerifyUrl(ticket.ticketNo)}`,
          }}
          onClose={onClose}
        />
        {/* ticket body */}
        <div id="ticket-sheet" className="overflow-hidden" style={{background:"#fff",borderRadius:20,boxShadow:ELEV[4]}}>
          {/* Hero band */}
          <div className="relative px-8 py-7" style={{background:B.primaryDeep,backgroundImage:geoBg}}>
            <div className="absolute top-0 inset-x-0 h-1.5" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
            <div className="flex items-start justify-between gap-6">
              <div>
                <div style={{fontFamily:"var(--font-app)",fontSize:11,fontWeight:700,color:B.gold,letterSpacing:3}}>TASAHEEL AL-UMRAH</div>
                <div style={{fontFamily:"var(--font-app)",fontSize:20,fontWeight:800,color:"#fff",marginTop:4,lineHeight:1.2}}>تساهيل العمرة</div>
                {/* ── «معتمدة» ──
                    كانت تُطبع على كل تذكرة بلا من اعتمدها ولا متى، وهي
                    كلمةٌ تُقرأ التزاماً. الآن تُذكر واقعةٌ يسندها عمود:
                    تاريخ الإصدار. ومن أرادها «معتمدة» يعرّف الاعتماد
                    أولاً — من يملكه وبأي شرط. */}
                <div className="mt-4 text-xs" style={{color:"#A39A8B"}}>
                  {ticket.issuedAt
                    ? `تذكرة سفر — صادرة ${new Date(ticket.issuedAt).toISOString().slice(0,10)}`
                    : "تذكرة سفر"}
                </div>
                <div className="mt-1">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full"
                    style={{background:phaseTone.bg,color:phaseTone.fg,fontSize:11,fontWeight:700}}>
                    <span aria-hidden style={{width:5,height:5,borderRadius:"50%",background:phaseTone.fg}}/>
                    {TICKET_PHASE_LABEL[phase]}
                  </span>
                </div>
              </div>
              <div className="text-left">
                <div className="text-xs font-bold mb-1" style={{color:"#A39A8B"}}>رقم التذكرة</div>
                <div style={{fontFamily:"var(--font-app)",fontSize:24,fontWeight:800,color:B.gold}}>{ticket.ticketNo}</div>
                <div className="text-xs mt-1" style={{color:"#A39A8B"}}>حجز: <span style={{fontFamily:"var(--font-app)"}}>{ticket.bookingId}</span></div>
              </div>
            </div>
          </div>

          {/* شريط المسار — من بيانات التذكرة لا نصّاً ثابتاً.

              كان مكتوباً «الرياض ← مكة المكرمة» حرفياً في كل تذكرة: رحلةٌ
              تنطلق من جدة تُصدر تذكرةً تقول الرياض، وباقة الحرمين تقول
              مكة وحدها. ونقطة الانطلاق الحقيقية كانت مطبوعة أسفل الورقة
              نفسها — فالتذكرة تناقض نفسها في موضعين منها.

              الوجهة تُستنتج من اسم الباقة لأن جدول tickets لا يحمل عموداً
              لها. استنتاجٌ من نصّ، وهو أضعف من عمود — لكنه أصدق من ثابت،
              وهو نفس ما تفعله بطاقات الإحصاء أعلى هذه الصفحة. العمود
              محلّه ensure_booking_docs متى استحقّ التغيير. */}
          <div className="px-8 py-5 flex items-center gap-4" style={{background:B.cream,borderBottom:`1px solid ${B.border}`}}>
            <div className="text-center min-w-0">
              {/* ── نقطة الانطلاق ──
                  كانت `departurePoint` وحدها — نصّاً حرّاً كتبه موظف مثل
                  «امام مكتب تساهيل». ذلك يكفي من يعرف المكتب، ولا يكفي
                  معتمراً يبحث عنه فجراً. الفرع المرتبط بالرحلة يحمل
                  الاسم والعنوان ورابط الخريطة، فيُقدَّم عليه ويبقى النصّ
                  الحرّ سطرَ تفصيلٍ تحته («أمام الباب الرئيسي»). */}
              <div className="font-extrabold text-xl truncate" style={{color:B.black,fontFamily:"var(--font-app)"}}>
                {origin.title||"—"}
              </div>
              <div className="text-xs mt-0.5" style={{color:B.muted}}>نقطة الانطلاق</div>
              {origin.detail && (
                <div className="text-xs mt-0.5 truncate" style={{color:B.text2}}>{origin.detail}</div>
              )}
              {origin.mapUrl && (
                <a href={origin.mapUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-bold mt-0.5 inline-block" style={{color:B.gold}}>
                  الموقع على الخريطة ↗
                </a>
              )}
            </div>
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 h-px" style={{background:B.border}}/>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-lg flex-shrink-0" style={{background:B.primaryDeep}}>🕋</div>
              <div className="flex-1 h-px" style={{background:B.border}}/>
            </div>
            <div className="text-center min-w-0">
              <div className="font-extrabold text-xl truncate" style={{color:B.black,fontFamily:"var(--font-app)"}}>
                {ticket.packageName.includes("المدينة")?"مكة والمدينة":"مكة المكرمة"}
              </div>
              <div className="text-xs mt-0.5" style={{color:B.muted}}>الوجهة</div>
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-0" style={{borderBottom:`1px solid ${B.border}`}}>
            {[
              {l:"الباقة",       v:ticket.packageName},
              {l:"تاريخ الرحلة",v:ticket.tripDate},
              {l:"وقت الانطلاق",v:ticket.tripTime},
              {l:"نوع السكن",   v:ticket.roomType},
            ].map((f,i)=>(
              <div key={f.l} className="px-6 py-4" style={{borderLeft:i<3?`1px solid ${B.border}`:"none"}}>
                <div className="text-xs font-semibold mb-1" style={{color:B.muted}}>{f.l}</div>
                <div className="font-bold text-sm" style={{color:B.black}}>{f.v}</div>
              </div>
            ))}
          </div>

          {/* Client */}
          <div className="px-8 py-5" style={{borderBottom:`1px solid ${B.border}`}}>
            <div className="text-xs font-extrabold mb-3" style={{color:B.primary}}>بيانات العميل</div>
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <div className="font-extrabold text-base" style={{color:"#000"}}>{ticket.clientName}</div>
                <div className="text-sm font-mono mt-0.5" style={{color:B.muted,direction:"ltr"}}>{ticket.clientPhone}</div>
              </div>
            </div>
          </div>

          {/* Dashed perforated separator */}
          <div className="relative flex items-center">
            <div className="absolute -right-3 w-6 h-6 rounded-full" style={{background:SCRIM,zIndex:1}}/>
            <div className="absolute -left-3 w-6 h-6 rounded-full" style={{background:SCRIM,zIndex:1}}/>
            <div className="flex-1 border-t-2 border-dashed mx-4" style={{borderColor:B.border}}/>
          </div>

          {/* Pilgrims */}
          <div className="px-8 py-5" style={{borderBottom:`1px solid ${B.border}`}}>
            <div className="text-xs font-bold mb-3" style={{color:B.muted}}>المعتمرون ({ticket.persons})</div>
            <div className="flex flex-col gap-2">
              {ticket.pilgrims.map((pg,i)=>(
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl" style={{background:B.cream,border:`1px solid #EDE4CF`}}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{background:pg.gender==="female"?"#F1E9FA":"#12100F",color:pg.gender==="female"?"#7226BE":B.gold}}>
                    {i+1}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-sm" style={{color:B.black}}>{pg.name}</div>
                    <div className="text-xs mt-0.5" style={{color:B.muted,fontFamily:"var(--font-app)"}}>{pg.idNumber||"—"}</div>
                  </div>
                  <div className="text-xs font-bold" style={{color:B.muted}}>{pg.gender==="male"?"ذكر":"أنثى"}</div>
                </div>
              ))}
            </div>
          </div>

          {/* رمز التحقّق + الإجمالي */}
          <div className="px-8 py-5 flex items-center gap-6 flex-wrap">
            {/* رمز حقيقي لا نمطاً يشبهه: كان هنا خمسة وعشرون مربّعاً ثابتة
                — نفس الشكل على كل تذكرة، لا يقرؤه ماسح، ولا يفرّق بين
                تذكرتين. الموظف على باب الحافلة كان يحمل ورقةً بزينة.
                QRBlock هو نفسه المستعمل في الفاتورة وواجهة المستفيد. */}
            <div className="flex flex-col items-center gap-1">
              <QRBlock seed={ticket.ticketNo} size={80}/>
              <div className="text-xs" style={{color:B.muted}}>رمز التحقق</div>
            </div>
            <div>
              <div className="text-xs font-semibold mb-1" style={{color:B.muted}}>الإجمالي المدفوع</div>
              <div className="font-bold text-sm" style={{color:B.black,fontFamily:"var(--font-app)"}}>{sar(ticket.total)}</div>
            </div>
          </div>
          {/* تذكرة ملغاة تقول سببها — «ألغِ التذكرة فوراً ولا تحذفها». */}
          {ticket.state==="cancelled"&&(
            <div className="mx-8 mb-5 rounded-xl px-5 py-3" style={{background:"#FBE6E6",border:"1px solid #F3C9C9"}}>
              <div className="text-xs font-extrabold" style={{color:"#BE2626"}}>تذكرة ملغاة</div>
              {ticket.cancelReason&&<div className="text-sm mt-0.5" style={{color:B.black}}>{ticket.cancelReason}</div>}
              {ticket.cancelledAt&&(
                <div className="text-xs mt-0.5" style={{color:B.muted}}>
                  {new Date(ticket.cancelledAt).toISOString().slice(0,16).replace("T"," · ")}
                </div>
              )}
            </div>
          )}
          {ticket.usedAt&&ticket.state!=="cancelled"&&(
            <div className="mx-8 mb-5 rounded-xl px-5 py-3" style={{background:"#E0F2FB",border:"1px solid #B9E0F2"}}>
              <div className="text-xs font-extrabold" style={{color:"#0E7CA8"}}>
                مُسحت {ticket.scanCount&&ticket.scanCount>1?`${ticket.scanCount} مرّات`:""}
              </div>
              <div className="text-xs mt-0.5" style={{color:B.muted}}>
                أوّل مسح: {new Date(ticket.usedAt).toISOString().slice(0,16).replace("T"," · ")}
              </div>
            </div>
          )}

          {/* Footer — بيانات الشركة الرسمية فقط */}
          <div className="px-8 py-4 text-center" style={{borderTop:`1px solid ${B.border}`}}>
            <div className="text-xs font-bold" style={{color:B.text2}}><OrgLine/></div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function TicketsPage({onMenuOpen}:{onMenuOpen?:()=>void}) {
  const tickets=useStore(s=>s.tickets);
  const [search,setSearch]=useState("");
  /* التصفية على القيمة الساكنة لا على كل ضغطة مفتاح. */
  const query = useDebounced(search);
  const [phaseFilter,setPhaseFilter]=useState<"all"|TicketPhase>("all");
  const [ticketId,setTicketId]=useState<string|null>(null);

  const curTicket = ticketId ? tickets.find(t=>t.ticketNo===ticketId) : null;

  const filtered = tickets.filter(t=>
    (phaseFilter==="all"||ticketPhase(t)===phaseFilter)&&
    (!query||(t.ticketNo+t.bookingId+t.clientName+t.clientPhone).toLowerCase().includes(query.toLowerCase()))
  );

  /* ترقيم الصفحات — الرسم على الصفحة الحالية وحدها. المفتاح يُعيد
     للصفحة الأولى عند تغيّر البحث أو المرشّح: من كان في الصفحة الخامسة
     ثم بحث عن اسم يجب أن يرى أول النتائج لا صفحتها الخامسة. */
  const sorter = useSort<TicketEntry,SortKey>(filtered, SORT_GET);
  const pg = usePaged(sorter.rows, `${query}|${phaseFilter}`);

  /* في Supabase لا نبحث في العناصر المحمّلة: admin_search_tickets تفلتر
     وتُرقّم في PostgreSQL. وإن غاب الإجراء (ترحيلٌ لم يُشغَّل) تُطفئ
     الدالة نفسها وتبقى التصفية المحلية أعلاه. الطور («صالحة/منتهية…»)
     يُشتقّ من تاريخ الرحلة لا من عمود، فيُصفّى في المتصفّح على الصفحة
     القادمة من الخادم — كما تفعل شاشة الطلبات مع «متأخّرة». */
  const srv = useServerPagedSearch<TicketEntry>({
    fn: "admin_search_tickets",
    args: { q: search },
    resetKey: search,
    all: tickets, idOf: t => t.ticketNo, idField: "ticket_no",
  });
  const serverSearching = srv.searching;
  const phaseOk = (t:TicketEntry)=>phaseFilter==="all"||ticketPhase(t)===phaseFilter;
  const base: Paged<TicketEntry> = srv.supported ? srv.paged : pg;
  const activePg: Paged<TicketEntry> = phaseFilter!=="all" && srv.supported
    ? { ...base, rows: base.rows.filter(phaseOk) }
    : base;

  const countOf = (ph:TicketPhase) => tickets.filter(t=>ticketPhase(t)===ph).length;
  const phaseChips: ChipOption<"all"|TicketPhase>[] = [
    { value:"all", label:"الكل", count:tickets.length },
    ...PHASES.map(ph=>({ value:ph, label:TICKET_PHASE_LABEL[ph], count:countOf(ph) })),
  ];
  const open = (no:string) => setTicketId(no);
  const filteredOut = tickets.length>0;
  /* الفرز للقائمة المحلية وحدها — صفحة القاعدة مرتّبةٌ هناك. */
  const Th = ({k,children,...rest}:{k:SortKey;children:React.ReactNode;style?:React.CSSProperties}) =>
    srv.supported ? <th {...rest}>{children}</th> : <SortTh k={k} sorter={sorter} {...rest}>{children}</SortTh>;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background: B.bg}}>
      <PageHeader title="التذاكر" crumb="تذاكر السفر" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>
      <div className="px-4 md:px-8 pt-1">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="كل التذاكر" value={tickets.length} sub="صادرة" accent onClick={()=>setPhaseFilter("all")}/>
          {/* الإحصاء بالطور لا بالوجهة: «كم تذكرة صالحة اليوم؟» سؤالٌ
              تشغيليّ، و«كم تذكرة لمكة؟» يُعرف من المرشّح. */}
          <StatCard label="صالحة" value={countOf("valid")} sub="قابلة للاستخدام" onClick={()=>setPhaseFilter("valid")}/>
          <StatCard label="مستخدمة" value={countOf("used")} sub="مُسحت على الباب" onClick={()=>setPhaseFilter("used")}/>
          <StatCard label="منتهية أو ملغاة" value={countOf("expired")+countOf("cancelled")} sub="خارج الخدمة"/>
        </div>
        <div className="ts-toolbar">
          <FilterChips label="حالة التذكرة" options={phaseChips} value={phaseFilter} onChange={v=>setPhaseFilter(v)}/>
          <span className="ts-toolbar-end ts-count" aria-live="polite">
            {serverSearching?"جارٍ البحث…":activePg.total===tickets.length?`${tickets.length} تذكرة`:`${activePg.total} من ${tickets.length}`}
          </span>
        </div>
      </div>
      <main className="flex-1 px-4 md:px-8 pb-8">
        <EntityGate entity="tickets" label="التذاكر" cols={7}>
        {/* على صفوف الصفحة لا على العدد الكلي: مرشّح الطور قد يُفرغ الصفحة والعدّ من الخادم غير فارغ. */}
        {!serverSearching&&activePg.rows.length===0 ? (
          <EmptyState
            icon={filteredOut?<SearchX size={22}/>:<Ticket size={22}/>}
            title={filteredOut?"لا تذاكر تطابق البحث":"لا تذاكر بعد"}
            note={filteredOut?"جرّب كلمةً أخرى أو أزل المرشّح.":"تصدر التذكرة بعد تأكيد الطلب وتظهر هنا."}
            action={filteredOut&&<Button variant="secondary" onClick={()=>{setSearch("");setPhaseFilter("all");}}>إزالة المرشّحات</Button>}/>
        ) : <>
        <div className="hidden md:block ui-table-wrap" style={{opacity:serverSearching?0.55:1,transition:"opacity .15s"}}>
          <div className="ui-table-scroll">
          <table className="ui-table" style={{minWidth:860}}>
            <thead>
              <tr>
                {/* «رقم الحجز» و«الجوال» و«نوع السكن» ووقت الانطلاق صارت
                    أسطراً ثانية تحت جيرانها: المعلومة باقية والأعمدة ستّة. */}
                <Th k="no">التذكرة</Th>
                <Th k="client">العميل</Th>
                <Th k="pkg">الباقة</Th>
                <Th k="persons" style={{textAlign:"center"}}>المعتمرون</Th>
                <Th k="trip">الرحلة</Th>
                {/* ── الحالة ──
                    «القائمة الآن لا تعرض الحالة» — فتذكرة رحلةٍ راحت
                    وتذكرةٌ لغدٍ تبدوان سواءً. */}
                <Th k="phase">الحالة</Th>
                <th className="col-action"><span className="sr-only">إجراء</span></th>
              </tr>
            </thead>
            <tbody>
              {activePg.rows.map(t=>(
                <tr key={t.ticketNo} className="is-clickable" tabIndex={0} aria-label={`عرض التذكرة ${t.ticketNo}`}
                  onClick={()=>open(t.ticketNo)}
                  onKeyDown={e=>{ if(e.key==="Enter"&&e.target===e.currentTarget) open(t.ticketNo); }}>
                  <td className="nowrap">
                    <div className="cell-main num">{t.ticketNo}</div>
                    <div className="cell-sub">الطلب <span className="num">{t.bookingId}</span></div>
                  </td>
                  <td>
                    <div className="cell-main nowrap">{t.clientName}</div>
                    <div className="cell-sub num">{t.clientPhone}</div>
                  </td>
                  <td>
                    <div className="nowrap" style={{color:B.text3}}>{t.packageName}</div>
                    <div className="cell-sub nowrap">{t.roomType}</div>
                  </td>
                  <td style={{textAlign:"center",color:B.text3}}>{t.persons}</td>
                  <td className="nowrap">
                    <div style={{color:B.text3}}>{fmtDateShort(t.tripDate)}</div>
                    <div className="cell-sub">{fmtTime(t.tripTime)}</div>
                  </td>
                  <td><PhaseBadge t={t}/></td>
                  <td className="col-action" onClick={e=>e.stopPropagation()}>
                    <div className="row-actions">
                      <IconButton size="sm" label={`عرض التذكرة ${t.ticketNo}`} onClick={()=>open(t.ticketNo)}><Eye size={15}/></IconButton>
                    </div>
                  </td>
                </tr>
              ))}
              {serverSearching&&activePg.rows.length===0&&<tr><td colSpan={7} style={{padding:"48px 16px",textAlign:"center",color:B.muted}}>جارٍ البحث في السجلّ…</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
        {/* Mobile cards */}
        <div className="md:hidden flex flex-col gap-2.5" style={{opacity:serverSearching?0.55:1}}>
          {activePg.rows.map(t=>(
            <div key={t.ticketNo} role="button" tabIndex={0} aria-label={`عرض التذكرة ${t.ticketNo}`} onClick={()=>open(t.ticketNo)}
              onKeyDown={e=>{ if(e.key==="Enter"&&e.target===e.currentTarget) open(t.ticketNo); }}
              className="ui-card ui-card--hover p-4" style={{cursor:"pointer"}}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold truncate" style={{color:B.black,fontSize:15}}>{t.clientName}</div>
                  <div className="text-xs mt-0.5" style={{color:B.muted}}>{t.ticketNo} · الطلب {t.bookingId}</div>
                </div>
                <PhaseBadge t={t}/>
              </div>
              <div className="text-sm mt-3" style={{color:B.text2}}>{t.packageName} · {t.persons} معتمر</div>
              <div className="text-xs mt-0.5" style={{color:B.muted}}>{t.roomType}</div>
              <div className="flex items-center justify-between mt-3 pt-3" style={{borderTop:`1px solid ${B.border}`}}>
                <div className="text-sm" style={{color:B.text3}}>الرحلة {fmtDateShort(t.tripDate)} · {fmtTime(t.tripTime)}</div>
                <span onClick={e=>e.stopPropagation()}>
                  <IconButton size="sm" variant="outline" label={`عرض التذكرة ${t.ticketNo}`} onClick={()=>open(t.ticketNo)}><Eye size={15}/></IconButton>
                </span>
              </div>
            </div>
          ))}
          {serverSearching&&activePg.rows.length===0&&<div className="ui-card ui-card--flat text-sm text-center py-12" style={{color:B.muted}}>جارٍ البحث في السجلّ…</div>}
        </div>
        </>}
        </EntityGate>
        <Pager p={activePg} unit="تذكرة"/>
      </main>
      <AnimatePresence>
        {curTicket&&<TicketCard ticket={curTicket} onClose={()=>setTicketId(null)}/>}
      </AnimatePresence>
    </div>
  );
}
