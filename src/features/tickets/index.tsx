import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Ticket } from "lucide-react";
import { B } from "@/lib/theme";
import type { TicketEntry } from "@/types";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { useStore } from "@/store/useStore";
import { Pager, usePaged } from "@/components/Pager";
import { OrgLine } from "@/components/OrgLine";
import { QRBlock } from "@/components/QRBlock";

/* ─── Ticket Print View ─── */
export function TicketCard({ticket,onClose}:{ticket:TicketEntry;onClose:()=>void}) {
  /* geometric tile SVG as data URL */
  const geoBg = `repeating-linear-gradient(45deg,rgba(192,134,44,.06) 0px,rgba(192,134,44,.06) 1px,transparent 1px,transparent 22px),repeating-linear-gradient(-45deg,rgba(192,134,44,.06) 0px,rgba(192,134,44,.06) 1px,transparent 1px,transparent 22px)`;
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-auto"
      style={{background:"rgba(14,12,11,.75)"}} onClick={onClose}>
      <div className="w-full max-w-2xl flex flex-col gap-3 my-4" onClick={e=>e.stopPropagation()}>
        {/* toolbar */}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:B.bg,color:B.text2,border:"none"}}>إغلاق</button>
        </div>
        {/* ticket body */}
        <div className="rounded-2xl overflow-hidden" style={{background:"#fff",boxShadow:"0 24px 64px -12px rgba(14,12,11,.5)"}}>
          {/* Hero band */}
          <div className="relative px-8 py-7" style={{background:B.primary,backgroundImage:geoBg}}>
            <div className="absolute top-0 inset-x-0 h-1.5" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
            <div className="flex items-start justify-between gap-6">
              <div>
                <div style={{fontFamily:"var(--font-app)",fontSize:11,fontWeight:700,color:B.gold,letterSpacing:3}}>TASAHEEL AL-UMRAH</div>
                <div style={{fontFamily:"var(--font-app)",fontSize:20,fontWeight:800,color:"#fff",marginTop:4,lineHeight:1.2}}>تساهيل العمرة</div>
                <div className="mt-4 text-xs" style={{color:"#86A8A4"}}>تذكرة سفر معتمدة</div>
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
              <div className="font-extrabold text-xl truncate" style={{color:B.black,fontFamily:"var(--font-app)"}}>{ticket.departurePoint||"—"}</div>
              <div className="text-xs mt-0.5" style={{color:B.muted}}>نقطة الانطلاق</div>
            </div>
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 h-px" style={{background:B.border}}/>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-lg flex-shrink-0" style={{background:B.primary}}>🕋</div>
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
              <div className="font-bold text-sm" style={{color:B.black,fontFamily:"var(--font-app)"}}>{ticket.total.toLocaleString("en-US")} ر.س</div>
            </div>
          </div>
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
  const [ticketId,setTicketId]=useState<string|null>(null);

  const curTicket = ticketId ? tickets.find(t=>t.ticketNo===ticketId) : null;

  const filtered = tickets.filter(t=>
    !search||(t.ticketNo+t.bookingId+t.clientName+t.clientPhone).toLowerCase().includes(search.toLowerCase())
  );

  /* ترقيم الصفحات — الرسم على الصفحة الحالية وحدها. المفتاح يُعيد
     للصفحة الأولى عند تغيّر البحث أو المرشّح: من كان في الصفحة الخامسة
     ثم بحث عن اسم يجب أن يرى أول النتائج لا صفحتها الخامسة. */
  const pg = usePaged(filtered, search);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background:B.bg}}>
      <PageHeader title="التذاكر" crumb="تذاكر السفر" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>
      {/* Stats */}
      <div className="px-4 md:px-8 pt-4 md:pt-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="إجمالي التذاكر" value={tickets.length} sub="صادرة" accent/>
          <StatCard label="رحلة مكة" value={tickets.filter(t=>t.packageName.includes("مكة")&&!t.packageName.includes("المدينة")).length} sub="تذاكر"/>
          <StatCard label="رحلة الحرمين" value={tickets.filter(t=>t.packageName.includes("المدينة")).length} sub="تذاكر"/>
          <StatCard label="إجمالي المعتمرين" value={tickets.reduce((a,t)=>a+t.persons,0)} sub="معتمر مؤكد"/>
        </div>
        <div className="mt-4" style={{height:1,background:B.border}}/>
      </div>
      {/* Table */}
      <main className="flex-1 px-4 md:px-8 py-6">
        {/* Desktop */}
        <div className="hidden md:block rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
            <thead>
              <tr style={{background:B.cream,color:"#7a7168",fontSize:12,textAlign:"right"}}>
                {["رقم التذكرة","رقم الحجز","العميل","الجوال","الباقة","الغرفة","تاريخ الرحلة","إجراء"].map(h=>(
                  <th key={h} style={{padding:"13px 16px",fontWeight:700}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pg.rows.map((t,i)=>(
                <tr key={t.ticketNo} style={{borderTop:`1px solid ${B.border}`,background:i%2===0?"#fff":"#FDFCFA"}}>
                  <td style={{padding:"14px 16px",fontWeight:800,fontFamily:"var(--font-app)",color:B.gold}}>{t.ticketNo}</td>
                  <td style={{padding:"14px 16px",fontFamily:"var(--font-app)",color:B.text2,fontSize:13}}>{t.bookingId}</td>
                  <td style={{padding:"14px 16px"}}>
                    <div className="font-bold text-sm" style={{color:B.black}}>{t.clientName}</div>
                    <div className="text-xs" style={{color:B.muted}}>{t.persons} معتمر</div>
                  </td>
                  <td style={{padding:"14px 16px",fontFamily:"var(--font-app)",color:B.text2,fontSize:13,direction:"ltr"}}>{t.clientPhone}</td>
                  <td style={{padding:"14px 16px",color:B.text2,fontSize:13}}>{t.packageName}</td>
                  <td style={{padding:"14px 16px",color:B.text3,fontSize:13}}>{t.roomType}</td>
                  <td style={{padding:"14px 16px",fontFamily:"var(--font-app)",color:B.text3,fontSize:13}}>{t.tripDate} · {t.tripTime}</td>
                  <td style={{padding:"14px 16px"}}>
                    <div className="flex gap-2">
                      <button onClick={()=>setTicketId(t.ticketNo)} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                        style={{background:B.gold,color:B.black,border:"none"}}>عرض التذكرة</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length===0&&<tr><td colSpan={8} style={{padding:"48px 16px",textAlign:"center",color:B.muted,fontWeight:600}}>لا توجد تذاكر مطابقة</td></tr>}
            </tbody>
          </table>
        </div>
        {/* Mobile cards */}
        <div className="md:hidden flex flex-col gap-3">
          {pg.rows.map(t=>(
            <motion.div key={t.ticketNo} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}}
              className="rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <div className="px-4 py-3 flex items-center justify-between" style={{background:B.primary}}>
                <span style={{fontFamily:"var(--font-app)",fontWeight:800,fontSize:15,color:B.gold}}>{t.ticketNo}</span>
                <span style={{fontFamily:"var(--font-app)",fontSize:12,color:"#9DBAB6"}}>{t.bookingId}</span>
              </div>
              <div className="p-4">
                <div className="font-bold text-sm mb-0.5" style={{color:B.black}}>{t.clientName}</div>
                <div className="text-xs mb-3" style={{color:B.muted}}>{t.packageName} · {t.persons} معتمر · {t.tripDate}</div>
                <button onClick={()=>setTicketId(t.ticketNo)} className="w-full py-2.5 rounded-xl text-sm font-bold cursor-pointer"
                  style={{background:B.gold,color:B.black,border:"none"}}>عرض التذكرة</button>
              </div>
            </motion.div>
          ))}
          {filtered.length===0&&<div className="flex flex-col items-center py-16 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><Ticket size={28} style={{opacity:.3,marginBottom:8}}/><p className="text-sm">لا توجد تذاكر مطابقة</p></div>}
        </div>
        <Pager p={pg} unit="تذكرة"/>
      </main>
      <AnimatePresence>
        {curTicket&&<TicketCard ticket={curTicket} onClose={()=>setTicketId(null)}/>}
      </AnimatePresence>
    </div>
  );
}
