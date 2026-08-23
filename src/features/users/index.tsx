import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Plus } from "lucide-react";
import { B } from "@/lib/theme";
import type { UserRole, SystemUser } from "@/types";
import { StatusBadge } from "@/components/StatusBadge";
import { Spinner } from "@/components/Spinner";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { DeleteDialog } from "@/components/DeleteDialog";
import { useStore } from "@/store/useStore";
import { isSupabaseEnabled } from "@/supabase/client";
import { toast } from "sonner";
import { createAuthUser, updateProfile, deleteProfile, setProfileStatus } from "@/supabase/adminUsers";

const ROLE_COLORS:Record<UserRole,{bg:string;fg:string}> = {
  "مدير عام":     {bg:"#FBF3D6",fg:"#8A6A08"},
  "مدير النظام":  {bg:"#EAF1FE",fg:"#1E52C7"},
  "موظف":         {bg:"#EEECEA",fg:"#5C554E"},
};

const EMPTY_USER:Omit<SystemUser,"id"|"lastLogin"> = { name:"", email:"", role:"موظف", status:"active" };

function UserModal({user,onSave,onClose}:{user:Partial<SystemUser>;onSave:(u:Partial<SystemUser>,pw:string)=>Promise<string|void>;onClose:()=>void}) {
  const [form,setForm]=useState({...EMPTY_USER,...user});
  const [pw,setPw]=useState("");
  const [err,setErr]=useState("");
  const [busy,setBusy]=useState(false);
  const f=(k:keyof typeof form)=>(v:string)=>setForm(p=>({...p,[k]:v}));
  const isEdit = !!user.id;
  const submit=async()=>{ if(busy) return; setBusy(true); setErr(""); const e=await onSave(form,pw); if(e){setErr(e); setBusy(false);} };
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{background:"rgba(21,76,72,.55)"}} onClick={onClose}>
      <motion.div initial={{scale:.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.95,opacity:0}}
        className="w-full max-w-md rounded-2xl overflow-hidden" style={{background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="relative px-6 py-5" style={{background:B.primary}}>
          <div className="absolute top-0 inset-x-0 h-1" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2})`}}/>
          <h3 className="font-extrabold text-base" style={{color:"#fff",margin:0}}>{isEdit?"تعديل بيانات المستخدم":"إضافة مستخدم جديد"}</h3>
          <button onClick={onClose} className="absolute top-4 left-4 p-1 cursor-pointer" style={{background:"none",border:"none",color:"#9DBAB6"}}><X size={16}/></button>
        </div>
        <div className="p-6 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>الاسم الكامل</label>
            <input value={form.name} onChange={e=>f("name")(e.target.value)} placeholder="الاسم الكامل"
              className="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border,fontFamily:"inherit"}}/>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>البريد الإلكتروني</label>
            <input value={form.email} onChange={e=>f("email")(e.target.value)} placeholder="name@tasahheel.com" type="email" disabled={isEdit}
              className="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border,fontFamily:"var(--font-app)",background:isEdit?B.bg:"#fff",opacity:isEdit?0.7:1}}/>
          </div>
          {!isEdit && isSupabaseEnabled && (
            <div>
              <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>كلمة المرور <span style={{color:B.gold}}>*</span></label>
              <input value={pw} onChange={e=>setPw(e.target.value)} placeholder="6 أحرف على الأقل" type="password"
                className="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border,direction:"ltr",textAlign:"left"}}/>
              <p className="text-xs mt-1" style={{color:B.muted}}>يُنشأ حساب دخول فعلي لهذا المستخدم في Supabase.</p>
            </div>
          )}
          <div>
            <label className="block text-xs font-bold mb-2" style={{color:B.text3}}>الدور</label>
            <div className="flex gap-2 flex-wrap">
              {(["مدير عام","مدير النظام","موظف"] as UserRole[]).map(r=>(
                <button key={r} type="button" onClick={()=>f("role")(r)}
                  className="px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all"
                  style={{border:`1px solid ${form.role===r?B.gold:B.border}`,background:form.role===r?B.primary:"#fff",color:form.role===r?B.gold:B.text2}}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 flex flex-col gap-3">
          {err && <div className="text-xs font-bold rounded-lg px-3 py-2" style={{background:"#FBE6E6",color:"#BE2626",border:"1px solid #F3C9C9"}}>{err}</div>}
          <div className="flex gap-3">
            <button onClick={submit} disabled={busy} className="px-6 py-2.5 rounded-xl font-extrabold text-sm cursor-pointer inline-flex items-center gap-2"
              style={{background:B.gold,color:B.black,border:"none",opacity:busy?0.6:1}}>
              {busy&&<Spinner size={14} color={B.black}/>}
              {busy?"جارٍ الحفظ…":isEdit?"حفظ التعديلات":"إضافة المستخدم"}</button>
            <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold text-sm cursor-pointer"
              style={{background:B.bg,color:B.text2,border:"none"}}>إلغاء</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function UsersPage({onMenuOpen}:{onMenuOpen?:()=>void}) {
  const users=useStore(s=>s.users); const setUsers=useStore(s=>s.setUsers);
  const [search,setSearch]=useState("");
  const [showModal,setShowModal]=useState(false);
  const [editTarget,setEditTarget]=useState<SystemUser|null>(null);
  const [deleteId,setDeleteId]=useState<string|null>(null);

  const filtered = users.filter(u=>
    !search||(u.name+u.email+u.role).toLowerCase().includes(search.toLowerCase())
  );

  async function saveUser(form:Partial<SystemUser>, pw:string):Promise<string|void> {
    if(editTarget) {
      setUsers(p=>p.map(u=>u.id===editTarget.id?{...u,...form}:u));
      if(isSupabaseEnabled) await updateProfile(editTarget.id, form.name||editTarget.name, (form.role||editTarget.role) as string);
      setShowModal(false); setEditTarget(null); return;
    }
    if(isSupabaseEnabled) {
      if(!form.email?.trim()) return "أدخل البريد الإلكتروني";
      if(!pw || pw.length<6) return "كلمة المرور 6 أحرف على الأقل";
      const { id, error } = await createAuthUser(form.email.trim(), pw, form.name||"", (form.role||"موظف") as string);
      if(!id) return error||"تعذّر إنشاء الحساب";
      const nu:SystemUser={...EMPTY_USER,...form,id,lastLogin:"—"} as SystemUser;
      setUsers(p=>[...p,nu]);
      setShowModal(false); setEditTarget(null);
      return error; // في حال أُنشئ الحساب لكن فشل حفظ الدور، يظهر تنبيه دون منع الإضافة
    }
    const nu:SystemUser={...EMPTY_USER,...form,id:`U-${String(users.length+1).padStart(2,"0")}`,lastLogin:"—"} as SystemUser;
    setUsers(p=>[...p,nu]);
    setShowModal(false); setEditTarget(null);
  }
  /* الإيقاف يكتب profiles أولاً ثم users. الترتيب مقصود: profiles هو ما
     تقرأه is_staff() في القاعدة، وusers سجلٌّ للعرض. لو فشل الأول لا
     نلمس الثاني — وإلا أظهرنا «موقوف» في الجدول لحسابٍ ما زال يعمل. */
  async function toggleStatus(id:string){
    const cur=users.find(u=>u.id===id); if(!cur) return;
    const next=cur.status==="active"?"inactive":"active";
    if(isSupabaseEnabled){
      const err=await setProfileStatus(id,next);
      if(err){ toast.error("تعذّر تغيير حالة الحساب",{description:err,duration:9000}); return; }
    }
    setUsers(p=>p.map(u=>u.id===id?{...u,status:next}:u));
    toast.success(next==="inactive"?"أُوقف الحساب":"فُعِّل الحساب",{
      description:next==="inactive"?"لن يستطيع الدخول ولا الكتابة بعد الآن.":"عاد وصوله كاملاً.",
    });
  }
  function deleteUser(id:string){setUsers(p=>p.filter(u=>u.id!==id));if(isSupabaseEnabled)deleteProfile(id);setDeleteId(null);}

  const stats={
    total:users.length,
    active:users.filter(u=>u.status==="active").length,
    admins:users.filter(u=>u.role==="مدير عام"||u.role==="مدير النظام").length,
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background:B.bg}}>
      <PageHeader title="المستخدمون" crumb="إدارة المستخدمين" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>
      {/* Stats */}
      <div className="px-4 md:px-8 pt-4 md:pt-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="إجمالي المستخدمين" value={stats.total} sub="في النظام" accent/>
          <StatCard label="نشطون" value={stats.active} sub="يمكنهم الدخول"/>
          <StatCard label="موقوفون" value={stats.total-stats.active} sub="مُعطَّل الوصول"/>
          <StatCard label="المدراء" value={stats.admins} sub="صلاحيات عليا"/>
        </div>
        <div className="flex items-center justify-between mt-5">
          <span className="text-sm" style={{color:B.muted}}>{filtered.length} مستخدم</span>
          <button onClick={()=>{setEditTarget(null);setShowModal(true);}} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:B.gold,color:B.black,border:"none",boxShadow:"0 4px 12px rgba(192,134,44,.3)"}}>
            <Plus size={14}/>إضافة مستخدم
          </button>
        </div>
        <div className="mt-4" style={{height:1,background:B.border}}/>
      </div>
      {/* Desktop table */}
      <main className="flex-1 px-4 md:px-8 py-6">
        <div className="hidden md:block rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
            <thead>
              <tr style={{background:B.cream,color:"#7a7168",fontSize:12,textAlign:"right"}}>
                {["المستخدم","البريد الإلكتروني","الدور","آخر دخول","الحالة","إجراءات"].map(h=>(
                  <th key={h} style={{padding:"13px 16px",fontWeight:700}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u,i)=>{
                const rc=ROLE_COLORS[u.role];
                return (
                  <tr key={u.id} style={{borderTop:`1px solid ${B.border}`,background:i%2===0?"#fff":"#FDFCFA"}}>
                    <td style={{padding:"14px 16px"}}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center font-extrabold text-sm flex-shrink-0"
                          style={{background:B.primary,color:B.gold}}>{u.name[0]}</div>
                        <span className="font-bold" style={{color:B.black}}>{u.name}</span>
                      </div>
                    </td>
                    <td style={{padding:"14px 16px",fontFamily:"var(--font-app)",color:B.muted,fontSize:13}}>{u.email}</td>
                    <td style={{padding:"14px 16px"}}>
                      <span className="px-3 py-1 rounded-full text-xs font-bold" style={{background:rc.bg,color:rc.fg}}>{u.role}</span>
                    </td>
                    <td style={{padding:"14px 16px",color:B.text2,fontSize:13}}>{u.lastLogin}</td>
                    <td style={{padding:"14px 16px"}}><StatusBadge status={u.status}/></td>
                    <td style={{padding:"14px 16px"}}>
                      <div className="flex gap-2">
                        <button onClick={()=>{setEditTarget(u);setShowModal(true);}} className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                          style={{background:"#fff",color:B.text2,border:`1px solid ${B.border}`}}>تعديل</button>
                        <button onClick={()=>toggleStatus(u.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                          style={{background:u.status==="active"?"#FBF3D6":"#E3F3E8",color:u.status==="active"?"#8A6A08":"#1E7A44",border:`1px solid ${u.status==="active"?"#F0E3AE":"#C4E4CE"}`}}>
                          {u.status==="active"?"إيقاف":"تفعيل"}
                        </button>
                        <button onClick={()=>setDeleteId(u.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                          style={{background:"#FBE6E6",color:"#BE2626",border:"1px solid #F3C9C9"}}>حذف</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length===0&&<tr><td colSpan={6} style={{padding:"48px 16px",textAlign:"center",color:B.muted}}>لا يوجد مستخدمون مطابقون</td></tr>}
            </tbody>
          </table>
        </div>
        {/* Mobile cards */}
        <div className="md:hidden flex flex-col gap-3">
          {filtered.map(u=>{
            const rc=ROLE_COLORS[u.role];
            return (
              <motion.div key={u.id} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}}
                className="rounded-2xl p-4" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-extrabold flex-shrink-0"
                    style={{background:B.primary,color:B.gold}}>{u.name[0]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm" style={{color:B.black}}>{u.name}</div>
                    <div className="text-xs font-mono truncate" style={{color:B.muted}}>{u.email}</div>
                  </div>
                  <StatusBadge status={u.status}/>
                </div>
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 rounded-full text-xs font-bold" style={{background:rc.bg,color:rc.fg}}>{u.role}</span>
                  <div className="flex gap-2">
                    <button onClick={()=>{setEditTarget(u);setShowModal(true);}} className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer" style={{background:"#fff",color:B.text2,border:`1px solid ${B.border}`}}>تعديل</button>
                    <button onClick={()=>toggleStatus(u.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                      style={{background:u.status==="active"?"#FBF3D6":"#E3F3E8",color:u.status==="active"?"#8A6A08":"#1E7A44",border:`1px solid ${u.status==="active"?"#F0E3AE":"#C4E4CE"}`}}>
                      {u.status==="active"?"إيقاف":"تفعيل"}
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </main>
      <AnimatePresence>
        {showModal&&<UserModal user={editTarget||{}} onSave={saveUser} onClose={()=>{setShowModal(false);setEditTarget(null);}}/>}
        {deleteId&&<DeleteDialog onConfirm={()=>deleteUser(deleteId)} onCancel={()=>setDeleteId(null)}/>}
      </AnimatePresence>
    </div>
  );
}
