import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plus, X, Building, MapPin, Phone } from "lucide-react";
import { B } from "@/lib/theme";
import type { Branch } from "@/types";
import { StatCard } from "@/components/StatCard";
import { Spinner } from "@/components/Spinner";
import { PageHeader } from "@/components/PageHeader";
import { DeleteDialog } from "@/components/DeleteDialog";
import { AppSelect } from "@/components/AppSelect";
import { useStore } from "@/store/useStore";
import { newId } from "@/lib/utils";
import { useRole } from "@/lib/useRole";
import { toast } from "sonner";

const EMPTY: Omit<Branch,"id"> = { name:"", city:"", address:"", gmapUrl:"", phone:"", managerId:"", isActive:true };
const NONE = "__none__";

function BranchModal({branch,managers,onSave,onClose}:{
  branch:Partial<Branch>;
  managers:{id:string;name:string}[];
  onSave:(b:Partial<Branch>)=>Promise<void>|void;
  onClose:()=>void;
}) {
  const [form,setForm]=useState<Omit<Branch,"id">&{id?:string}>({...EMPTY,...branch});
  const [errors,setErrors]=useState<{[k:string]:string}>({});
  const [busy,setBusy]=useState(false);
  const set=<K extends keyof typeof form>(k:K,v:(typeof form)[K])=>setForm(f=>({...f,[k]:v}));
  const inp="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none";
  const ist={borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"} as const;

  function validate(){
    const e:{[k:string]:string}={};
    if(!form.name.trim())    e.name="اسم الفرع مطلوب";
    if(!form.city.trim())    e.city="المدينة مطلوبة";
    if(!form.address.trim()) e.address="العنوان التفصيلي مطلوب";
    if(form.phone && !/^[+0-9\s]{7,}$/.test(form.phone.trim())) e.phone="رقم جوال غير صحيح";
    setErrors(e);
    return Object.keys(e).length===0;
  }
  async function handleSave(){
    if(busy) return;
    if(!validate()) return;
    setBusy(true);
    try { await onSave(form); } finally { setBusy(false); }
  }
  const Err=({k}:{k:string})=> errors[k] ? <div className="text-xs font-bold mt-1" style={{color:"#BE2626"}}>{errors[k]}</div> : null;
  const req=<span style={{color:B.gold}}>*</span>;

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-auto"
      style={{background:"rgba(21,76,72,.55)"}} onClick={onClose}>
      <motion.div initial={{scale:.96,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.96,opacity:0}}
        className="w-full max-w-lg my-4 rounded-2xl overflow-hidden" style={{background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="relative px-6 py-5" style={{background:B.primary}}>
          <div className="absolute top-0 inset-x-0 h-1" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2})`}}/>
          <h3 className="font-extrabold text-base" style={{color:"#fff",margin:0,fontFamily:"var(--font-app)"}}>{branch.id?"تعديل فرع":"إضافة فرع جديد"}</h3>
          <button onClick={onClose} className="absolute top-4 left-4 p-1 cursor-pointer" style={{background:"none",border:"none",color:"#9DBAB6"}}><X size={16}/></button>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>اسم الفرع {req}</label>
            <input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="فرع الرياض — العليا" className={inp} style={ist}/>
            <Err k="name"/>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>المدينة {req}</label>
            <input value={form.city} onChange={e=>set("city",e.target.value)} placeholder="الرياض" className={inp} style={ist}/>
            <Err k="city"/>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>رقم جوال الفرع</label>
            <input value={form.phone} onChange={e=>set("phone",e.target.value)} placeholder="+966 11 000 0000" className={inp} style={{...ist,direction:"ltr",textAlign:"right"}}/>
            <Err k="phone"/>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>العنوان التفصيلي {req}</label>
            <input value={form.address} onChange={e=>set("address",e.target.value)} placeholder="طريق الملك فهد، حي العليا" className={inp} style={ist}/>
            <Err k="address"/>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>رابط Google Maps</label>
            <input value={form.gmapUrl} onChange={e=>set("gmapUrl",e.target.value)} placeholder="https://maps.google.com/…" className={inp} style={{...ist,direction:"ltr",textAlign:"right"}}/>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>المسؤول عن الفرع</label>
            <AppSelect value={form.managerId||NONE} placeholder="اختر المسؤول"
              onChange={v=>set("managerId",v===NONE?"":v)}
              options={[{value:NONE,label:"بدون مسؤول"},...managers.map(m=>({value:m.id,label:m.name}))]}/>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>الحالة</label>
            <AppSelect value={form.isActive?"active":"inactive"}
              onChange={v=>set("isActive",v==="active")}
              options={[{value:"active",label:"نشط"},{value:"inactive",label:"غير نشط"}]}/>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={handleSave} disabled={busy} className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-extrabold text-sm cursor-pointer"
            style={{background:busy?"#d6cfc6":B.gold,color:busy?"#a09688":B.black,border:"none",cursor:busy?"not-allowed":"pointer"}}>
            {busy && <Spinner size={14} color={B.black}/>}
            {busy?"جارٍ الحفظ…":"حفظ الفرع"}
          </button>
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold text-sm cursor-pointer" style={{background:B.bg,color:B.text2,border:"none"}}>إلغاء</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function BranchesPage({onMenuOpen}:{onMenuOpen?:()=>void}) {
  /* بوابة الكتابة — مرآة can_write_admin() في القاعدة. كل نقاط فتح
     نموذج التعديل تمرّ من هنا، فالموظف لا يملأ نموذجاً ليُرفض في آخره. */
  const { canWrite } = useRole();
  const mayWrite = canWrite("branches");
  const openForm = (t: any) => {
    if (!mayWrite) {
      toast.error("لا تملك صلاحية التعديل", { description: "هذه الشاشة يكتبها مدير النظام وحده." });
      return;
    }
    setEditTarget(t); setShowModal(true);
  };
  const branches = useStore(s=>s.branches);
  const setBranches = useStore(s=>s.setBranches);
  const users = useStore(s=>s.users);
  const [search,setSearch]=useState("");
  const [showModal,setShowModal]=useState(false);
  const [editTarget,setEditTarget]=useState<Branch|null>(null);
  const [delId,setDelId]=useState<string|null>(null);

  const managers = useMemo(()=>users.map(u=>({id:u.id,name:u.name})),[users]);
  const managerName=(id:string)=>users.find(u=>u.id===id)?.name??"—";

  const filtered = useMemo(()=>{
    const q=search.trim();
    return branches.filter(b=> !q || b.name.includes(q) || b.city.includes(q) || b.address.includes(q));
  },[branches,search]);

  const stats = {
    total: branches.length,
    active: branches.filter(b=>b.isActive).length,
    inactive: branches.filter(b=>!b.isActive).length,
    cities: new Set(branches.map(b=>b.city)).size,
  };

  function saveBranch(b:Partial<Branch>){
    if(b.id){
      setBranches(prev=>prev.map(x=>x.id===b.id?{...x,...b} as Branch:x));
    } else {
      const id=newId("BR");
      setBranches(prev=>[...prev,{...EMPTY,...b,id} as Branch]);
    }
    setShowModal(false); setEditTarget(null);
  }
  function removeBranch(id:string){ setBranches(prev=>prev.filter(b=>b.id!==id)); setDelId(null); }
  function toggleActive(b:Branch){ setBranches(prev=>prev.map(x=>x.id===b.id?{...x,isActive:!x.isActive}:x)); }

  const gmapCell=(url:string)=> url
    ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold" style={{color:B.primary}}><MapPin size={12}/>خريطة</a>
    : <span style={{color:B.muted}}>—</span>;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background:B.bg}}>
      <PageHeader title="الفروع" crumb="إدارة الفروع" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>
      <div className="px-4 md:px-8 pt-4 md:pt-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="إجمالي الفروع" value={stats.total} sub="في السجل" accent/>
          <StatCard label="فروع نشطة" value={stats.active} sub="متاحة"/>
          <StatCard label="غير نشطة" value={stats.inactive} sub="معطّلة"/>
          <StatCard label="المدن" value={stats.cities} sub="مدينة"/>
        </div>
        <div className="flex items-center justify-between gap-3 mt-5 flex-wrap">
          <span className="text-sm" style={{color:B.muted}}>{filtered.length} فرع</span>
          {/* زرّ الإضافة يُخفى لا يُعطَّل: زرٌّ مرئي يعد بعملٍ لا يُنجَز. */}
          {mayWrite && (
          <button onClick={()=>{openForm(null);}} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:B.gold,color:B.black,border:"none",boxShadow:"0 4px 12px rgba(192,134,44,0.3)"}}>
            <Plus size={14}/>إضافة فرع جديد
          </button>
          )}
        </div>
        <div className="mt-4" style={{height:1,background:B.border}}/>
      </div>

      <main className="flex-1 px-4 md:px-8 pb-12 pt-6">
        {/* Desktop table */}
        <div className="hidden md:block rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
            <thead>
              <tr style={{background:B.cream,color:"#7a7168",fontSize:12,textAlign:"right"}}>
                {["اسم الفرع","المدينة","العنوان","الخريطة","الجوال","المسؤول","الحالة","إجراءات"].map(h=>(
                  <th key={h} style={{padding:"13px 16px",fontWeight:700}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((b,i)=>(
                <tr key={b.id} style={{borderTop:`1px solid ${B.border}`,background:i%2===0?"#fff":"#FDFCFA"}}>
                  <td style={{padding:"14px 16px"}}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:B.primary,color:B.gold}}><Building size={15}/></div>
                      <span className="font-bold" style={{color:B.black}}>{b.name}</span>
                    </div>
                  </td>
                  <td style={{padding:"14px 16px",color:B.text3}}>{b.city}</td>
                  <td style={{padding:"14px 16px",color:B.text2,fontSize:13,maxWidth:220}}>{b.address}</td>
                  <td style={{padding:"14px 16px"}}>{gmapCell(b.gmapUrl)}</td>
                  <td style={{padding:"14px 16px",fontFamily:"var(--font-app)",color:B.text2,fontSize:13,direction:"ltr",textAlign:"right"}}>{b.phone||"—"}</td>
                  <td style={{padding:"14px 16px",color:B.text3}}>{b.managerId?managerName(b.managerId):"—"}</td>
                  <td style={{padding:"14px 16px"}}>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold"
                      style={{background:b.isActive?"#E3F3E8":"#EEECEA",color:b.isActive?"#1E7A44":"#5C554E"}}>{b.isActive?"نشط":"غير نشط"}</span>
                  </td>
                  <td style={{padding:"14px 16px"}}>
                    <div className="flex gap-2">
                      <button onClick={()=>{openForm(b);}} className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer" style={{background:"#fff",color:B.text2,border:`1px solid ${B.border}`}}>تعديل</button>
                      <button onClick={()=>toggleActive(b)} className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer" style={{background:b.isActive?"#FBF3D6":"#E3F3E8",color:b.isActive?"#8A6A08":"#1E7A44",border:"none"}}>{b.isActive?"تعطيل":"تفعيل"}</button>
                      <button onClick={()=>setDelId(b.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer" style={{background:"#FBE6E6",color:"#BE2626",border:"1px solid #F3C9C9"}}>حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length===0&&<tr><td colSpan={8} style={{padding:"48px 16px",textAlign:"center",color:B.muted,fontWeight:600}}>لا توجد فروع مطابقة</td></tr>}
            </tbody>
          </table>
        </div>
        {/* Mobile cards */}
        <div className="md:hidden flex flex-col gap-3">
          {filtered.map(b=>(
            <motion.div key={b.id} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} className="rounded-2xl p-4" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:B.primary,color:B.gold}}><Building size={16}/></div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm" style={{color:B.black}}>{b.name}</div>
                  <div className="text-xs" style={{color:B.muted}}>{b.city}</div>
                </div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold" style={{background:b.isActive?"#E3F3E8":"#EEECEA",color:b.isActive?"#1E7A44":"#5C554E"}}>{b.isActive?"نشط":"غير نشط"}</span>
              </div>
              <div className="text-xs mb-3" style={{color:B.text2}}>{b.address}</div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs" style={{color:B.text2}}>
                  {b.phone&&<span className="inline-flex items-center gap-1" style={{direction:"ltr"}}><Phone size={12}/>{b.phone}</span>}
                  {gmapCell(b.gmapUrl)}
                </div>
                <div className="flex gap-2">
                  <button onClick={()=>{openForm(b);}} className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer" style={{background:"#fff",color:B.text2,border:`1px solid ${B.border}`}}>تعديل</button>
                  <button onClick={()=>setDelId(b.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer" style={{background:"#FBE6E6",color:"#BE2626",border:"1px solid #F3C9C9"}}>حذف</button>
                </div>
              </div>
            </motion.div>
          ))}
          {filtered.length===0&&<div className="flex flex-col items-center py-16 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><Building size={28} style={{opacity:.3,marginBottom:8}}/><p className="text-sm">لا توجد فروع مطابقة</p></div>}
        </div>
      </main>

      <AnimatePresence>
        {showModal&&<BranchModal branch={editTarget||{}} managers={managers} onSave={saveBranch} onClose={()=>{setShowModal(false);setEditTarget(null);}}/>}
        {delId&&<DeleteDialog onConfirm={()=>removeBranch(delId)} onCancel={()=>setDelId(null)}/>}
      </AnimatePresence>
    </div>
  );
}
