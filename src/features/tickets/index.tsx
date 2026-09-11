import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Ticket } from "lucide-react";
import { B } from "@/lib/theme";
import { useDebounced } from "@/lib/useDebounced";
import type { TicketEntry } from "@/types";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { useStore } from "@/store/useStore";
import { Pager, usePaged, type Paged } from "@/components/Pager";
import { useServerPagedSearch } from "@/lib/useServerSearch";
import { sar } from "@/lib/money";
import { EntityGate } from "@/components/States";
import { OrgLine } from "@/components/OrgLine";
import { QRBlock } from "@/components/QRBlock";
import { invVerifyUrl } from "@/lib/utils";
import { DocActions } from "@/features/docs/DocActions";
import { ticketPhase, TICKET_PHASE_LABEL, TICKET_PHASE_TONE, docFileName } from "@/lib/docPhase";
import type { TicketPhase } from "@/types";

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
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-auto"
      style={{background:"rgba(14,12,11,.75)"}} onClick={onClose}>
      <div className="w-full max-w-2xl flex flex-col gap-3 my-4" onClick={e=>e.stopPropagation()}>
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
        <div id="ticket-sheet" className="rounded-2xl overflow-hidden" style={{background:"#fff",boxShadow:"0 24px 64px -12px rgba(14,12,11,.5)"}}>
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
                <div className="mt-4 text-xs" style={{color:"#86A8A4"}}>
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
                <div className="text-xs font-bold mb-1" style={{color:"#86A8A4"}}>رقم التذكرة</div>
                <div style={{fontFamily:"var(--font-app)",fontSize:24,fontWeight:800,color:B.gold}}>{ticket.ticketNo}</div>
                <div className="text-xs mt-1" style={{color:"#86A8A4"}}>حجز: <span style={{fontFamily:"var(--font-app)"}}>{ticket.bookingId}</span></div>
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
            <div className="absolute -right-3 w-6 h-6 rounded-full" style={{background:"rgba(14,12,11,.75)",zIndex:1}}/>
            <div className="absolute -left-3 w-6 h-6 rounded-full" style={{background:"rgba(14,12,11,.75)",zIndex:1}}/>
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
  const pg = usePaged(filtered, `${query}|${phaseFilter}`);

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

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background: B.bg}}>
      <PageHeader title="التذاكر" crumb="تذاكر السفر" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>
      {/* Stats */}
      <div className="px-4 md:px-8 pt-4 md:pt-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="إجمالي التذاكر" value={tickets.length} sub="صادرة" accent/>
          {/* الإحصاء بالطور لا بالوجهة: «كم تذكرة صالحة اليوم؟» سؤالٌ
              تشغيليّ، و«كم تذكرة لمكة؟» يُعرف من المرشّح. */}
          <StatCard label="صالحة" value={tickets.filter(t=>ticketPhase(t)==="valid").length} sub="قابلة للاستخدام"/>
          <StatCard label="مستخدمة" value={tickets.filter(t=>ticketPhase(t)==="used").length} sub="مُسحت على الباب"/>
          <StatCard label="منتهية أو ملغاة" value={tickets.filter(t=>["expired","cancelled"].includes(ticketPhase(t))).length} sub="خارج الخدمة"/>
        </div>
        <div className="flex items-center gap-2 mt-5 flex-wrap">
          {([["all","الكل"],["valid","صالحة"],["used","مستخدمة"],["expired","منتهية"],["cancelled","ملغاة"]] as [string,string][]).map(([v,l])=>(
            <button key={v} onClick={()=>setPhaseFilter(v as "all"|TicketPhase)}
              style={{padding:"7px 16px",borderRadius:999,fontSize:13,fontWeight:700,cursor:"pointer",
                border:`1px solid ${phaseFilter===v?B.gold:B.border}`,
                background:phaseFilter===v?B.gold:"#fff",
                color:phaseFilter===v?B.black:B.text2,whiteSpace:"nowrap"}}>{l}</button>
          ))}
          <span className="mr-auto text-sm font-semibold" style={{color:B.muted}}>{serverSearching?"جارِ البحث…":`${activePg.total} / ${tickets.length}`}</span>
        </div>
        <div className="mt-4" style={{height:1,background:B.border}}/>
      </div>
      {/* Table */}
      <main className="flex-1 px-4 md:px-8 py-6">
        <EntityGate entity="tickets" label="التذاكر" cols={8}>
        {/* Desktop */}
        <div className="hidden md:block rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
          <div className="tbl-scroll tbl-wide">
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
            <thead>
              <tr style={{background:B.cream,color:"#7a7168",fontSize:12,textAlign:"right"}}>
                {["رقم التذكرة","رقم الحجز","العميل","الجوال","الباقة","تاريخ الرحلة","الحالة","إجراء"].map(h=>(
                  <th key={h} className={h==="إجراء"||h==="إجراءات"?"col-action":undefined} style={{padding:"13px 16px",fontWeight:700}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activePg.rows.map((t,i)=>(
                <tr key={t.ticketNo} style={{borderTop:`1px solid ${B.border}`,background:i%2===0?"#fff":"#FDFCFA"}}>
                  <td style={{padding:"14px 16px",fontWeight:800,fontFamily:"var(--font-app)",color:B.gold}}>{t.ticketNo}</td>
                  <td style={{padding:"14px 16px",fontFamily:"var(--font-app)",color:B.text2,fontSize:13}}>{t.bookingId}</td>
                  <td style={{padding:"14px 16px"}}>
                    <div className="font-bold text-sm" style={{color:B.black}}>{t.clientName}</div>
                    <div className="text-xs" style={{color:B.muted}}>{t.persons} معتمر</div>
                  </td>
                  <td style={{padding:"14px 16px",fontFamily:"var(--font-app)",color:B.text2,fontSize:13,direction:"ltr"}}>{t.clientPhone}</td>
                  <td style={{padding:"14px 16px",color:B.text2,fontSize:13}}>
                    {t.packageName}
                    <div style={{color:B.muted,fontSize:11}}>{t.roomType}</div>
                  </td>
                  <td style={{padding:"14px 16px",fontFamily:"var(--font-app)",color:B.text3,fontSize:13}}>{t.tripDate} · {t.tripTime}</td>
                  {/* ── الحالة ──
                      «القائمة الآن لا تعرض الحالة» — فتذكرة رحلةٍ راحت
                      وتذكرةٌ لغدٍ تبدوان سواءً. */}
                  <td style={{padding:"14px 16px"}}>{(()=>{
                    const ph=ticketPhase(t); const tn=TICKET_PHASE_TONE[ph];
                    return (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
                        style={{background:tn.bg,color:tn.fg}}>
                        <span aria-hidden className="w-1.5 h-1.5 rounded-full" style={{background:tn.fg}}/>
                        {TICKET_PHASE_LABEL[ph]}
                      </span>
                    ); })()}</td>
                  <td className="col-action" style={{padding:"14px 16px"}}>
                    <div className="flex gap-2">
                      <button onClick={()=>setTicketId(t.ticketNo)} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                        style={{background:B.gold,color:B.black,border:"none"}}>عرض التذكرة</button>
                    </div>
                  </td>
                </tr>
              ))}
              {serverSearching&&<tr><td colSpan={8} style={{padding:"48px 16px",textAlign:"center",color:B.muted,fontWeight:600}}>جارِ البحث في السجل…</td></tr>}
              {/* على صفوف الصفحة لا على العدد الكلي: مرشّح الطور قد يُفرغ الصفحة والعدّ من الخادم غير فارغ. */}
              {!serverSearching&&activePg.rows.length===0&&<tr><td colSpan={8} style={{padding:"48px 16px",textAlign:"center",color:B.muted,fontWeight:600}}>لا توجد تذاكر مطابقة</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
        {/* Mobile cards */}
        <div className="md:hidden flex flex-col gap-3">
          {activePg.rows.map(t=>(
            <motion.div key={t.ticketNo} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}}
              className="rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <div className="px-4 py-3 flex items-center justify-between" style={{background:B.primaryDeep}}>
                <span style={{fontFamily:"var(--font-app)",fontWeight:800,fontSize:15,color:B.gold}}>{t.ticketNo}</span>
                <span style={{fontFamily:"var(--font-app)",fontSize:12,color:"#9DBAB6"}}>{t.bookingId}</span>
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <div className="font-bold text-sm" style={{color:B.black}}>{t.clientName}</div>
                  {(()=>{ const ph=ticketPhase(t); const tn=TICKET_PHASE_TONE[ph];
                    return <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                      style={{background:tn.bg,color:tn.fg}}>{TICKET_PHASE_LABEL[ph]}</span>; })()}
                </div>
                <div className="text-xs mb-3" style={{color:B.muted}}>{t.packageName} · {t.persons} معتمر · {t.tripDate}</div>
                <button onClick={()=>setTicketId(t.ticketNo)} className="w-full py-2.5 rounded-xl text-sm font-bold cursor-pointer"
                  style={{background:B.gold,color:B.black,border:"none"}}>عرض التذكرة</button>
              </div>
            </motion.div>
          ))}
          {serverSearching&&<div className="flex flex-col items-center py-16 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><span className="text-sm font-medium">جارِ البحث في السجل…</span></div>}
          {!serverSearching&&activePg.rows.length===0&&<div className="flex flex-col items-center py-16 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><Ticket size={28} style={{opacity:.3,marginBottom:8}}/><p className="text-sm">لا توجد تذاكر مطابقة</p></div>}
        </div>
        </EntityGate>
        <Pager p={activePg} unit="تذكرة"/>
      </main>
      <AnimatePresence>
        {curTicket&&<TicketCard ticket={curTicket} onClose={()=>setTicketId(null)}/>}
      </AnimatePresence>
    </div>
  );
}
