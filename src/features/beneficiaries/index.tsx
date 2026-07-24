import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plus, X, Users, CreditCard, Ticket, ArrowRight } from "lucide-react";
import { B } from "@/lib/theme";
import type { Beneficiary, Payment, Booking, TicketEntry } from "@/types";
import { StatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { useStore } from "@/store/useStore";
import { InvoiceModal } from "@/features/payments";
import { TicketCard } from "@/features/tickets";

const EMPTY_BEN: Omit<Beneficiary,"id"|"bookingIds"> = { name:"", phone:"", idNumber:"", nationality:"", gender:"male", birthDate:"", rating:0, notes:"", suspended:false };

function StarRating({value,onChange}:{value:number;onChange?:(v:number)=>void}) {
  const [hover,setHover]=useState(0);
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(n=>(
        <button key={n} type="button"
          onClick={()=>onChange?.(n)}
          onMouseEnter={()=>onChange&&setHover(n)}
          onMouseLeave={()=>onChange&&setHover(0)}
          className="text-2xl leading-none p-0 cursor-pointer"
          style={{background:"none",border:"none",color:(hover||value)>=n?B.gold:"#D8D0C4"}}>
          ★
        </button>
      ))}
    </div>
  );
}

function BenTag({b}:{b:Beneficiary}) {
  if(b.suspended) return <StatusBadge status="suspended"/>;
  if(b.bookingIds.length>=3) return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold" style={{background:"#FBF3D6",color:"#8A6A08"}}>⭐ وفيّ</span>;
  if(b.bookingIds.length>=2) return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold" style={{background:"#E3F3E8",color:"#1E7A44"}}>متكرر</span>;
  return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold" style={{background:"#EAF1FE",color:"#1E52C7"}}>جديد</span>;
}

function BenModal({ben,onSave,onClose}:{ben:Partial<Beneficiary>;onSave:(b:Partial<Beneficiary>)=>void;onClose:()=>void}) {
  const [form,setForm]=useState({...EMPTY_BEN,...ben});
  const f=(k:keyof typeof form)=>(v:string|number)=>setForm(p=>({...p,[k]:v}));
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{background:"rgba(21,76,72,.55)"}} onClick={onClose}>
      <motion.div initial={{scale:.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.95,opacity:0}}
        className="w-full max-w-lg rounded-2xl overflow-hidden" style={{background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="relative px-6 py-5" style={{background:B.primary}}>
          <div className="absolute top-0 inset-x-0 h-1" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2})`}}/>
          <h3 className="font-extrabold text-base" style={{color:"#fff",margin:0}}>{ben.id?"تعديل بيانات المستفيد":"إضافة مستفيد جديد"}</h3>
          <button onClick={onClose} className="absolute top-4 left-4 p-1 cursor-pointer" style={{background:"none",border:"none",color:"#9DBAB6"}}><X size={16}/></button>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>الاسم الكامل</label>
            <input value={form.name} onChange={e=>f("name")(e.target.value)} placeholder="الاسم الكامل"
              className="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border,fontFamily:"inherit"}}/>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>رقم الجوال</label>
            <input value={form.phone} onChange={e=>f("phone")(e.target.value)} placeholder="05xxxxxxxx"
              className="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border,fontFamily:"inherit"}}/>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>رقم الهوية</label>
            <input value={form.idNumber} onChange={e=>f("idNumber")(e.target.value)} placeholder="10xxxxxxxx"
              className="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border,fontFamily:"inherit"}}/>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>الجنسية</label>
            <input value={form.nationality} onChange={e=>f("nationality")(e.target.value)} placeholder="ابحث أو اكتب"
              className="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border,fontFamily:"inherit"}}/>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>تاريخ الميلاد</label>
            <input type="date" value={form.birthDate} onChange={e=>f("birthDate")(e.target.value)}
              className="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border,fontFamily:"inherit"}}/>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-bold mb-2" style={{color:B.text3}}>الجنس</label>
            <div className="flex gap-3">
              {(["male","female"] as const).map(g=>(
                <button key={g} type="button" onClick={()=>f("gender")(g)}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm cursor-pointer transition-all"
                  style={{border:`1px solid ${form.gender===g?B.gold:B.border}`,background:form.gender===g?B.primary:"#fff",color:form.gender===g?B.gold:B.text2}}>
                  {g==="male"?"ذكر":"أنثى"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={()=>onSave(form)} className="px-6 py-2.5 rounded-xl font-extrabold text-sm cursor-pointer"
            style={{background:B.gold,color:B.black,border:"none"}}>حفظ المستفيد</button>
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold text-sm cursor-pointer"
            style={{background:B.bg,color:B.text2,border:"none"}}>إلغاء</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function CancellationModal({booking,onClose}:{booking:Booking;onClose:()=>void}) {
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-auto"
      style={{background:"rgba(21,76,72,.65)"}} onClick={onClose}>
      <div className="w-full max-w-md my-6 rounded-2xl overflow-hidden" style={{background:"#fff",boxShadow:"0 24px 64px -12px rgba(21,76,72,.45)"}} onClick={e=>e.stopPropagation()}>
        <div className="relative px-6 py-5" style={{background:B.primary}}>
          <div className="absolute top-0 inset-x-0 h-1.5" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
          <div className="flex items-center justify-between">
            <div>
              <div style={{fontFamily:"'Noto Kufi Arabic',serif",fontSize:18,fontWeight:800,color:"#fff"}}>إشعار إلغاء</div>
              <div className="text-xs mt-1" style={{color:"#9DBAB6"}}>رقم الطلب: <span style={{fontFamily:"'IBM Plex Mono',monospace"}}>{booking.id}</span></div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer" style={{background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.15)",color:"#CDE7E4"}}><X size={14}/></button>
          </div>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <div>
            <div className="text-xs font-extrabold mb-1" style={{color:B.primary}}>العميل</div>
            <div className="font-extrabold text-base" style={{color:"#000"}}>{booking.clientName}</div>
            <div className="text-sm font-mono" style={{color:B.muted,direction:"ltr"}}>{booking.clientPhone}</div>
          </div>
          <div className="rounded-xl px-4 py-3 text-sm font-bold flex items-center gap-2" style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}>
            <X size={14}/>تم إلغاء هذا الطلب.
          </div>
          <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{background:B.bg,border:`1px solid ${B.border}`}}>
            <span className="font-bold text-sm" style={{color:"#000"}}>المبلغ المسترد</span>
            <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:18,fontWeight:800,color:"#000"}}>{booking.total.toLocaleString("en-US")} ر.س</span>
          </div>
          <div className="text-center text-xs font-bold pt-2" style={{color:B.text2,borderTop:`1px solid ${B.border}`}}>تساهيل العمرة · السجل التجاري: 1010537391 · tasaaheel.sa</div>
        </div>
      </div>
    </motion.div>
  );
}

export function BeneficiariesPage({bookings,onMenuOpen}:{bookings:Booking[];onMenuOpen?:()=>void}) {
  const bens=useStore(s=>s.beneficiaries); const setBens=useStore(s=>s.setBeneficiaries);
  const payments=useStore(s=>s.payments); const tickets=useStore(s=>s.tickets);
  const [search,setSearch]=useState("");
  const [genderFilter,setGenderFilter]=useState<"all"|"male"|"female">("all");
  const [detailId,setDetailId]=useState<string|null>(null);
  const [showModal,setShowModal]=useState(false);
  const [editTarget,setEditTarget]=useState<Beneficiary|null>(null);
  const [invoiceView,setInvoiceView]=useState<Payment|null>(null);
  const [ticketView,setTicketView]=useState<TicketEntry|null>(null);
  const [cancelView,setCancelView]=useState<Booking|null>(null);
  const openInvoice=(bk:Booking)=>setInvoiceView(payments.find(p=>p.bookingId===bk.id)??{id:`INV-${bk.id.replace("TSH-","")}`,bookingId:bk.id,clientName:bk.clientName,clientPhone:bk.clientPhone,packageName:"—",tripDate:"—",total:bk.total,payMethod:bk.payMethod||"—",payStatus:bk.paymentStatus==="verified"?"verified":bk.paymentStatus==="sent"?"sent":bk.paymentStatus==="failed"?"failed":"none",txnNo:bk.txnNo||"—",payDate:bk.payDate||"—",createdAt:bk.createdAt.split(" ")[0],roomType:bk.roomType,pilgrims:bk.pilgrims});
  const openTicket=(bk:Booking)=>{const t=tickets.find(t=>t.bookingId===bk.id);if(t)setTicketView(t);};

  const detail = detailId ? bens.find(b=>b.id===detailId) : null;

  const filtered = bens.filter(b=>
    (genderFilter==="all"||b.gender===genderFilter)&&
    (!search||(b.name+b.phone+b.idNumber).includes(search))
  );

  function saveBen(form:Partial<Beneficiary>) {
    if(editTarget) {
      setBens(p=>p.map(b=>b.id===editTarget.id?{...b,...form}:b));
    } else {
      const nb:Beneficiary={...EMPTY_BEN,...form,id:`BEN-${String(bens.length+1).padStart(3,"0")}`,bookingIds:[]};
      setBens(p=>[...p,nb]);
    }
    setShowModal(false); setEditTarget(null);
  }
  function openEdit(b:Beneficiary){setEditTarget(b);setShowModal(true);}
  function toggleSuspend(id:string){setBens(p=>p.map(b=>b.id===id?{...b,suspended:!b.suspended}:b));}
  function setRating(id:string,r:number){setBens(p=>p.map(b=>b.id===id?{...b,rating:r}:b));}
  function setNotes(id:string,n:string){setBens(p=>p.map(b=>b.id===id?{...b,notes:n}:b));}

  const stats={
    total:bens.length,
    male:bens.filter(b=>b.gender==="male").length,
    female:bens.filter(b=>b.gender==="female").length,
    repeat:bens.filter(b=>b.bookingIds.length>1).length,
  };

  const gBtn=(v:"all"|"male"|"female",l:string)=>({
    padding:"7px 18px",borderRadius:999,fontSize:13,fontWeight:700,cursor:"pointer" as const,
    border:`1px solid ${genderFilter===v?B.gold:B.border}`,
    background:genderFilter===v?B.primary:"#fff",
    color:genderFilter===v?B.gold:B.text2,
  });

  if(detail) return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background:B.bg}}>
      <PageHeader title="المستفيدون" crumb="ملف المستفيد" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>
      <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="flex-1 px-4 md:px-8 pb-12 pt-5 max-w-4xl">
        <button onClick={()=>setDetailId(null)} className="flex items-center gap-2 text-sm font-bold mb-5 cursor-pointer" style={{background:"none",border:"none",color:B.text2}}>
          <ArrowRight size={14}/>عودة للمستفيدين
        </button>
        {/* Profile header */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div className="rounded-2xl p-5 flex items-center gap-4" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 font-extrabold text-2xl"
              style={{background:detail.gender==="female"?"#F1E9FA":"#12100F",color:detail.gender==="female"?"#7226BE":B.gold}}>
              {detail.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-lg" style={{color:B.black,fontFamily:"'Noto Kufi Arabic',serif"}}>{detail.name}</div>
              <div className="text-sm font-mono mt-0.5" style={{color:B.muted,direction:"ltr"}}>{detail.phone}</div>
              <div className="mt-2"><BenTag b={detail}/></div>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              <button onClick={()=>openEdit(detail)} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer" style={{background:"#fff",color:B.text2,border:`1px solid ${B.border}`}}>تعديل</button>
              <button onClick={()=>toggleSuspend(detail.id)} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                style={{background:detail.suspended?"#E3F3E8":"#FBE6E6",color:detail.suspended?"#1E7A44":"#BE2626",border:`1px solid ${detail.suspended?"#C4E4CE":"#F3C9C9"}`}}>
                {detail.suspended?"إلغاء الإيقاف":"إيقاف"}
              </button>
            </div>
          </div>
          <div className="rounded-2xl p-5" style={{background:B.primary}}>
            <div className="grid grid-cols-3 gap-4">
              {[{l:"الطلبات",v:detail.bookingIds.length,c:"#fff"},{l:"مكتملة",v:bookings.filter(bk=>detail.bookingIds.includes(bk.id)&&bk.status==="confirmed").length,c:"#fff"},{l:"الإنفاق",v:(bookings.filter(bk=>detail.bookingIds.includes(bk.id)&&["paid","confirmed"].includes(bk.status)).reduce((a,bk)=>a+bk.total,0)).toLocaleString("en-US")+" ر.س",c:B.gold}].map(s=>(
                <div key={s.l}>
                  <div className="text-xs mb-1" style={{color:"#9DBAB6",fontWeight:600}}>{s.l}</div>
                  <div className="font-extrabold text-xl leading-tight" style={{color:s.c,fontFamily:"'Noto Kufi Arabic',serif"}}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Personal data */}
        <div className="rounded-2xl p-5 mb-5" style={{background:"#fff",border:`1px solid ${B.border}`}}>
          <div className="font-bold mb-4" style={{color:B.black,fontSize:15}}>البيانات الشخصية</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[{l:"الجنس",v:detail.gender==="male"?"ذكر":"أنثى"},{l:"رقم الهوية",v:detail.idNumber||"—"},{l:"الجنسية",v:detail.nationality||"—"},{l:"تاريخ الميلاد",v:detail.birthDate||"—"}].map(f=>(
              <div key={f.l}>
                <div className="text-xs font-semibold mb-0.5" style={{color:B.muted}}>{f.l}</div>
                <div className="font-bold text-sm" style={{color:B.black}}>{f.v}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Rating + Notes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div className="rounded-2xl p-5" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <div className="font-bold mb-3" style={{color:B.black,fontSize:15}}>تقييم المستفيد</div>
            <StarRating value={detail.rating} onChange={r=>setRating(detail.id,r)}/>
            <div className="text-xs mt-2" style={{color:B.muted}}>اضغط على النجوم لتحديث التقييم</div>
          </div>
          <div className="rounded-2xl p-5" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <div className="font-bold mb-3" style={{color:B.black,fontSize:15}}>ملاحظات داخلية</div>
            <textarea value={detail.notes} onChange={e=>setNotes(detail.id,e.target.value)}
              rows={3} placeholder="تفضيلاته، متطلبات خاصة..."
              className="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none resize-none"
              style={{borderColor:B.border,fontFamily:"inherit",color:B.black}}/>
          </div>
        </div>
        {/* Booking history */}
        <div className="rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
          <div className="px-5 py-4 font-bold" style={{color:B.black,borderBottom:`1px solid ${B.border}`}}>سجل الطلبات ({detail.bookingIds.length})</div>
          <div className="overflow-x-auto">
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
              <thead>
                <tr style={{background:B.cream,color:"#7a7168",fontSize:12,textAlign:"right"}}>
                  {["رقم الطلب","التاريخ","المبلغ","الحالة","المستندات"].map(h=>(
                    <th key={h} style={{padding:"11px 16px",fontWeight:700}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bookings.filter(bk=>detail.bookingIds.includes(bk.id)).map(bk=>{
                  const docBtn=(label:string,on:()=>void,icon:any)=>{const Icon=icon;return (
                    <button onClick={on} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                      style={{background:B.bg,border:`1px solid ${B.border}`,color:"#8a6a08"}}><Icon size={12}/>{label}</button>
                  );};
                  const cancelled=bk.status==="cancelled"||bk.status==="rejected";
                  const confirmed=bk.status==="confirmed";
                  return (
                  <tr key={bk.id} style={{borderTop:`1px solid ${B.border}`}}>
                    <td style={{padding:"13px 16px",fontWeight:700,fontFamily:"'IBM Plex Mono',monospace",color:B.black,fontSize:13}}>{bk.id}</td>
                    <td style={{padding:"13px 16px",color:B.text3}}>{bk.createdAt}</td>
                    <td style={{padding:"13px 16px",fontWeight:700,color:B.black,fontFamily:"'IBM Plex Mono',monospace"}}>{bk.total.toLocaleString("en-US")} ر.س</td>
                    <td style={{padding:"13px 16px"}}><StatusBadge status={bk.status}/></td>
                    <td style={{padding:"10px 16px"}}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {cancelled
                          ? docBtn("إشعار الإلغاء",()=>setCancelView(bk),X)
                          : confirmed
                            ? <>{docBtn("الفاتورة",()=>openInvoice(bk),CreditCard)}{docBtn("التذكرة",()=>openTicket(bk),Ticket)}</>
                            : docBtn("الفاتورة المبدئية",()=>openInvoice(bk),CreditCard)}
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {detail.bookingIds.length===0&&<tr><td colSpan={5} style={{padding:"32px 16px",textAlign:"center",color:B.muted}}>لا توجد طلبات مسجّلة</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
      <AnimatePresence>
        {showModal&&<BenModal ben={editTarget||{}} onSave={saveBen} onClose={()=>{setShowModal(false);setEditTarget(null);}}/>}
        {invoiceView&&<InvoiceModal pay={invoiceView} onClose={()=>setInvoiceView(null)}/>}
        {ticketView&&<TicketCard ticket={ticketView} onClose={()=>setTicketView(null)}/>}
        {cancelView&&<CancellationModal booking={cancelView} onClose={()=>setCancelView(null)}/>}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background:B.bg}}>
      <PageHeader title="المستفيدون" crumb="إدارة المستفيدين" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>
      {/* Stats */}
      <div className="px-4 md:px-8 pt-4 md:pt-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="إجمالي المستفيدين" value={stats.total} sub="في السجل" accent/>
          <StatCard label="ذكور" value={stats.male} sub="معتمر"/>
          <StatCard label="إناث" value={stats.female} sub="معتمرة"/>
          <StatCard label="حجوزات متكررة" value={stats.repeat} sub="أكثر من رحلة"/>
        </div>
        <div className="flex items-center justify-between gap-3 mt-5 flex-wrap">
          <div className="flex gap-2">
            <button style={gBtn("all","الكل")} onClick={()=>setGenderFilter("all")}>الكل</button>
            <button style={gBtn("male","ذكور")} onClick={()=>setGenderFilter("male")}>ذكور</button>
            <button style={gBtn("female","إناث")} onClick={()=>setGenderFilter("female")}>إناث</button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{color:B.muted}}>{filtered.length} مستفيد</span>
            <button onClick={()=>{setEditTarget(null);setShowModal(true);}} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
              style={{background:B.gold,color:B.black,border:"none",boxShadow:"0 4px 12px rgba(192,134,44,0.3)"}}>
              <Plus size={14}/>إضافة مستفيد
            </button>
          </div>
        </div>
        <div className="mt-4" style={{height:1,background:B.border}}/>
      </div>
      {/* Desktop table */}
      <main className="flex-1 px-4 md:px-8 pb-12 pt-6">
        <div className="hidden md:block rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
            <thead>
              <tr style={{background:B.cream,color:"#7a7168",fontSize:12,textAlign:"right"}}>
                {["المستفيد","الجوال","الجنس","رقم الهوية","الطلبات","التقييم","التصنيف","إجراء"].map(h=>(
                  <th key={h} style={{padding:"13px 16px",fontWeight:700}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((b,i)=>(
                <tr key={b.id} style={{borderTop:`1px solid ${B.border}`,background:i%2===0?"#fff":"#FDFCFA"}}>
                  <td style={{padding:"14px 16px"}}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                        style={{background:b.gender==="female"?"#F1E9FA":"#12100F",color:b.gender==="female"?"#7226BE":B.gold}}>
                        {b.name[0]}
                      </div>
                      <span className="font-bold" style={{color:B.black}}>{b.name}</span>
                    </div>
                  </td>
                  <td style={{padding:"14px 16px",fontFamily:"'IBM Plex Mono',monospace",color:B.text2,fontSize:13}}>{b.phone}</td>
                  <td style={{padding:"14px 16px",color:B.text3}}>{b.gender==="male"?"ذكر":"أنثى"}</td>
                  <td style={{padding:"14px 16px",fontFamily:"'IBM Plex Mono',monospace",color:B.muted,fontSize:13}}>{b.idNumber||"—"}</td>
                  <td style={{padding:"14px 16px",fontWeight:700,color:B.black,textAlign:"center"}}>{b.bookingIds.length}</td>
                  <td style={{padding:"14px 16px"}}>
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(n=><span key={n} style={{color:n<=b.rating?B.gold:"#D8D0C4",fontSize:16}}>★</span>)}
                    </div>
                  </td>
                  <td style={{padding:"14px 16px"}}><BenTag b={b}/></td>
                  <td style={{padding:"14px 16px"}}>
                    <div className="flex gap-2">
                      <button onClick={()=>setDetailId(b.id)} className="px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer" style={{background:B.primary,color:B.cream,border:"none"}}>الملف</button>
                      <button onClick={()=>openEdit(b)} className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer" style={{background:"#fff",color:B.text2,border:`1px solid ${B.border}`}}>تعديل</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length===0&&<tr><td colSpan={8} style={{padding:"48px 16px",textAlign:"center",color:B.muted,fontWeight:600}}>لا يوجد مستفيدون مطابقون</td></tr>}
            </tbody>
          </table>
        </div>
        {/* Mobile cards */}
        <div className="md:hidden flex flex-col gap-3">
          {filtered.map(b=>(
            <motion.div key={b.id} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}}
              className="rounded-2xl p-4" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0"
                  style={{background:b.gender==="female"?"#F1E9FA":"#12100F",color:b.gender==="female"?"#7226BE":B.gold}}>
                  {b.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm" style={{color:B.black}}>{b.name}</div>
                  <div className="text-xs font-mono" style={{color:B.muted}}>{b.phone}</div>
                </div>
                <BenTag b={b}/>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-0.5">{[1,2,3,4,5].map(n=><span key={n} style={{color:n<=b.rating?B.gold:"#D8D0C4",fontSize:14}}>★</span>)}</div>
                <div className="flex gap-2">
                  <button onClick={()=>setDetailId(b.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer" style={{background:B.primary,color:B.cream,border:"none"}}>الملف</button>
                  <button onClick={()=>openEdit(b)} className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer" style={{background:"#fff",color:B.text2,border:`1px solid ${B.border}`}}>تعديل</button>
                </div>
              </div>
            </motion.div>
          ))}
          {filtered.length===0&&<div className="flex flex-col items-center py-16 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><Users size={28} style={{opacity:.3,marginBottom:8}}/><p className="text-sm">لا يوجد مستفيدون مطابقون</p></div>}
        </div>
      </main>
      <AnimatePresence>
        {showModal&&<BenModal ben={editTarget||{}} onSave={saveBen} onClose={()=>{setShowModal(false);setEditTarget(null);}}/>}
      </AnimatePresence>
    </div>
  );
}
