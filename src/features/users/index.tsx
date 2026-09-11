import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Plus, Mail, Building2 } from "lucide-react";
import { B } from "@/lib/theme";
import { useDebounced } from "@/lib/useDebounced";
import type { UserRole, SystemUser } from "@/types";
import { StatusBadge } from "@/components/StatusBadge";
import { Spinner } from "@/components/Spinner";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { DeleteDialog } from "@/components/DeleteDialog";
import { useStore } from "@/store/useStore";
import { setArchiveReason } from "@/data/repository";
import { isSupabaseEnabled } from "@/supabase/client";
import { toast } from "sonner";
import { inviteUser, resendInvite, updateProfile, setProfileStatus } from "@/supabase/adminUsers";
import { Field } from "@/components/Field";
import { AppSelect } from "@/components/AppSelect";
import { PASSWORD_MIN } from "@/lib/password";
import { Pager, usePaged } from "@/components/Pager";
import { EntityGate } from "@/components/States";

const ROLE_COLORS:Record<UserRole,{bg:string;fg:string}> = {
  "مدير عام":     {bg:"#FBF3D6",fg:"#8A6A08"},
  "مدير النظام":  {bg:"#EAF1FE",fg:"#1E52C7"},
  "موظف":         {bg:"#EEECEA",fg:"#5C554E"},
};

const EMPTY_USER:Omit<SystemUser,"id"|"lastLogin"> = { name:"", email:"", role:"موظف", status:"active" };

const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function UserModal({user,others,onSave,onClose}:{user:Partial<SystemUser>;others:SystemUser[];onSave:(u:Partial<SystemUser>)=>Promise<string|void>;onClose:()=>void}) {
  const branches=useStore(s=>s.branches);
  const [form,setForm]=useState({...EMPTY_USER,...user});
  const [err,setErr]=useState("");
  const [busy,setBusy]=useState(false);
  const [tried,setTried]=useState(false);
  const f=(k:keyof typeof form)=>(v:string)=>setForm(p=>({...p,[k]:v}));
  const isEdit = !!user.id;
  /* «اجعل الاسم والبريد إلزاميين وطبّق تحقق البريد وعدم التكرار» —
     التحقّق هنا قبل الإرسال، والقاعدة تعيده (upsert_user) لمن تجاوز الواجهة. */
  const errors:{name?:string;email?:string}={};
  if(!form.name.trim()) errors.name="الاسم الكامل إلزامي";
  const email=form.email.trim().toLowerCase();
  if(!email) errors.email="البريد الإلكتروني إلزامي";
  else if(!EMAIL_RE.test(email)) errors.email="صيغة البريد غير صحيحة";
  else if(others.some(u=>u.id!==user.id&&u.email.trim().toLowerCase()===email)) errors.email="هذا البريد مستعمل لمستخدمٍ آخر";
  const invalid=Object.keys(errors).length>0;
  const submit=async()=>{ if(busy) return; setTried(true); if(invalid) return; setBusy(true); setErr(""); const e=await onSave({...form,name:form.name.trim(),email}); if(e){setErr(e); setBusy(false);} };
  const activeBranches=branches.filter(b=>b.isActive);
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{background:"rgba(21,76,72,.55)"}} onClick={onClose}>
      <motion.div initial={{scale:.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.95,opacity:0}}
        className="w-full max-w-md rounded-2xl overflow-hidden" style={{background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="relative px-6 py-5" style={{background:B.primaryDeep}}>
          <div className="absolute top-0 inset-x-0 h-1" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2})`}}/>
          <h3 className="font-extrabold text-base" style={{color:"#fff",margin:0}}>{isEdit?"تعديل بيانات المستخدم":"دعوة مستخدم جديد"}</h3>
          <button aria-label="إغلاق النافذة" title="إغلاق النافذة" onClick={onClose} className="absolute top-4 left-4 p-1 cursor-pointer" style={{background:"none",border:"none",color:"#9DBAB6"}}><X size={16}/></button>
        </div>
        <div className="p-6 flex flex-col gap-4">
          <div>
            <Field label={<>الاسم الكامل <span style={{color:"#BE2626"}}>*</span></>} error={tried?errors.name:undefined}>
              <input value={form.name} onChange={e=>f("name")(e.target.value)} placeholder="الاسم الكامل" aria-invalid={tried&&!!errors.name}
                className="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none" style={{borderColor:tried&&errors.name?"#BE2626":B.border,fontFamily:"inherit"}}/>
            </Field>
          </div>
          <div>
            <Field label={<>البريد الإلكتروني <span style={{color:"#BE2626"}}>*</span></>} error={tried?errors.email:undefined}>
              <input value={form.email} onChange={e=>f("email")(e.target.value)} placeholder="name@company.sa" type="email" disabled={isEdit} aria-invalid={tried&&!!errors.email}
                className="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none" style={{borderColor:tried&&errors.email?"#BE2626":B.border,fontFamily:"var(--font-app)",background:isEdit?B.fill:"#fff",opacity:isEdit?0.7:1,direction:"ltr",textAlign:"left"}}/>
            </Field>
          </div>
          {/* لا حقل كلمة مرور: المدير لا يعرف كلمة أحد. تُرسَل دعوةٌ يضبط
              فيها المستخدم كلمته بنفسه وفق السياسة (١٢ محرفاً فأكثر). */}
          {!isEdit && isSupabaseEnabled && (
            <div className="rounded-xl px-4 py-3 flex items-start gap-3 text-xs" style={{background:"#E3F3E8",border:"1px solid #C4E4CE",color:"#1E5A34"}}>
              <Mail size={15} style={{flexShrink:0,marginTop:1,color:"#1E7A44"}}/>
              <div>يصل المستخدم بريدٌ فيه رابطٌ يختار به كلمة مروره بنفسه ({PASSWORD_MIN} محرفاً فأكثر). لا كلمة تُكتب هنا ولا تُرسَل في رسالة.</div>
            </div>
          )}
          <div>
            <label className="block text-xs font-bold mb-2" style={{color:B.text3}}>الدور</label>
            <div className="flex gap-2 flex-wrap">
              {(["مدير عام","مدير النظام","موظف"] as UserRole[]).map(r=>(
                <button key={r} type="button" onClick={()=>f("role")(r)}
                  className="px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all"
                  style={{border:`1px solid ${form.role===r?B.gold:B.border}`,background:form.role===r?B.gold:"#fff",color:form.role===r?B.black:B.text2}}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          {/* الفرع يقصّ نطاق البيانات في القاعدة (RLS): موظفٌ بفرعٍ يرى حجوزات
              فرعه؛ بلا فرع يرى الكل؛ والمدير يرى الكل أياً كان فرعه. */}
          <div>
            <Field label={<span className="inline-flex items-center gap-1.5"><Building2 size={12}/>الفرع</span>}>
              <AppSelect value={form.branchId??""} placeholder="كل الفروع" onChange={v=>f("branchId")(v)}
                options={[{value:"",label:"— كل الفروع —"},...activeBranches.map(b=>({value:b.id,label:`${b.name} · ${b.city}`}))]}/>
            </Field>
            <div className="text-xs mt-1.5" style={{color:B.muted}}>
              {form.role==="موظف"
                ? (form.branchId?"يرى حجوزات هذا الفرع ورحلاته وفواتيره وتذاكره فقط.":"بلا فرع: يرى كل الحجوزات. اختر فرعاً لقصر نطاقه.")
                : "المدير يرى كل الفروع مهما كان فرعه — الفرع هنا للعرض والتعيين."}
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 flex flex-col gap-3">
          {err && <div className="text-xs font-bold rounded-lg px-3 py-2" style={{background:"#FBE6E6",color:"#BE2626",border:"1px solid #F3C9C9"}}>{err}</div>}
          <div className="flex gap-3">
            <button onClick={submit} disabled={busy} className="px-6 py-2.5 rounded-xl font-extrabold text-sm cursor-pointer inline-flex items-center gap-2"
              style={{background:B.gold,color:B.black,border:"none",opacity:busy||(tried&&invalid)?0.6:1}}>
              {busy&&<Spinner size={14} color={B.black}/>}
              {busy?"جارٍ الحفظ…":isEdit?"حفظ التعديلات":"إرسال الدعوة"}</button>
            <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold text-sm cursor-pointer"
              style={{background:B.fill,color:B.text2,border:"none"}}>إلغاء</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function UsersPage({onMenuOpen}:{onMenuOpen?:()=>void}) {
  const users=useStore(s=>s.users); const setUsers=useStore(s=>s.setUsers);
  const [search,setSearch]=useState("");
  /* التصفية على القيمة الساكنة لا على كل ضغطة مفتاح. */
  const query = useDebounced(search);
  const [showModal,setShowModal]=useState(false);
  const [editTarget,setEditTarget]=useState<SystemUser|null>(null);
  const [deleteId,setDeleteId]=useState<string|null>(null);

  const filtered = users.filter(u=>
    !query||(u.name+u.email+u.role).toLowerCase().includes(query.toLowerCase())
  );

  /* ترقيم الصفحات — الرسم على الصفحة الحالية وحدها. المفتاح يُعيد
     للصفحة الأولى عند تغيّر البحث أو المرشّح: من كان في الصفحة الخامسة
     ثم بحث عن اسم يجب أن يرى أول النتائج لا صفحتها الخامسة. */
  const pg = usePaged(filtered, query);

  const currentUser=useStore(s=>s.currentUser);
  const branches=useStore(s=>s.branches);
  const branchName=(id?:string)=>id?branches.find(b=>b.id===id)?.name:undefined;

  async function saveUser(form:Partial<SystemUser>):Promise<string|void> {
    if(editTarget) {
      if(isSupabaseEnabled){
        /* profiles أولاً — هو ما تقرأه الصلاحيات والنطاق؛ فإن فشل لا نلمس users. */
        const e=await updateProfile(editTarget.id, form.name||editTarget.name, (form.role||editTarget.role) as string, form.branchId??"");
        if(e) return e;
      }
      setUsers(p=>p.map(u=>u.id===editTarget.id?{...u,...form,branchId:form.branchId||undefined}:u));
      setShowModal(false); setEditTarget(null); return;
    }
    if(isSupabaseEnabled) {
      const { id, error, inviteSent } = await inviteUser(form.email!.trim(), form.name||"", (form.role||"موظف") as string, form.branchId||undefined);
      if(!id) return error||"تعذّر إنشاء الحساب";
      const nu:SystemUser={...EMPTY_USER,...form,id,lastLogin:"—",branchId:form.branchId||undefined} as SystemUser;
      setUsers(p=>[...p,nu]);
      setShowModal(false); setEditTarget(null);
      if(inviteSent) toast.success("أُرسلت الدعوة",{description:`${form.email} يصله رابطٌ يختار به كلمة مروره.`,duration:8000});
      return error; // أُنشئ الحساب وفشل الدور أو الدعوة: يُقال ولا يُمنع
    }
    const nu:SystemUser={...EMPTY_USER,...form,id:`U-${String(users.length+1).padStart(2,"0")}`,lastLogin:"—"} as SystemUser;
    setUsers(p=>[...p,nu]);
    setShowModal(false); setEditTarget(null);
  }
  async function resend(u:SystemUser){
    const e=await resendInvite(u.email);
    if(e) toast.error("تعذّر إرسال الدعوة",{description:e}); else toast.success("أُعيد إرسال رابط تعيين كلمة المرور",{description:u.email});
  }
  /* الإيقاف يكتب profiles أولاً ثم users. الترتيب مقصود: profiles هو ما
     تقرأه is_staff() في القاعدة، وusers سجلٌّ للعرض. لو فشل الأول لا
     نلمس الثاني — وإلا أظهرنا «موقوف» في الجدول لحسابٍ ما زال يعمل. */
  async function toggleStatus(id:string){
    const cur=users.find(u=>u.id===id); if(!cur) return;
    const next=cur.status==="active"?"inactive":"active";
    /* «امنع المستخدم من حذف أو إيقاف حسابه الحالي» — هنا وفي الحارس معاً. */
    if(next==="inactive"&&currentUser?.id===id){ toast.error("لا يمكنك إيقاف حسابك الحالي",{description:"اطلب من مدير آخر إن لزم."}); return; }
    if(isSupabaseEnabled){
      const err=await setProfileStatus(id,next);
      if(err){ toast.error("تعذّر تغيير حالة الحساب",{description:err,duration:9000}); return; }
    }
    setUsers(p=>p.map(u=>u.id===id?{...u,status:next}:u));
    toast.success(next==="inactive"?"أُوقف الحساب":"فُعِّل الحساب",{
      description:next==="inactive"?"لن يستطيع الدخول ولا الكتابة بعد الآن.":"عاد وصوله كاملاً.",
    });
  }
  function archiveUser(id:string, reason:string){
    if(currentUser?.id===id){ toast.error("لا يمكنك أرشفة حسابك الحالي"); setDeleteId(null); return; }
    const cur=users.find(u=>u.id===id);
    const admins=users.filter(u=>u.status==="active"&&(u.role==="مدير عام"||u.role==="مدير النظام"));
    if(cur&&admins.length<=1&&admins.some(a=>a.id===id)){ toast.error("لا يمكن أرشفة آخر مدير نشط"); setDeleteId(null); return; }
    setArchiveReason(reason);
    setUsers(p=>p.filter(u=>u.id!==id));
    setDeleteId(null);
  }

  const stats={
    total:users.length,
    active:users.filter(u=>u.status==="active").length,
    admins:users.filter(u=>u.role==="مدير عام"||u.role==="مدير النظام").length,
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background: B.bg}}>
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
        <EntityGate entity="users" label="المستخدمين" cols={7}>
        <div className="hidden md:block rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
          <div className="tbl-scroll tbl-wide">
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
            <thead>
              <tr style={{background:B.cream,color:"#7a7168",fontSize:12,textAlign:"right"}}>
                {["المستخدم","البريد الإلكتروني","الدور","الفرع","آخر دخول","الحالة","إجراءات"].map(h=>(
                  <th key={h} className={h==="إجراء"||h==="إجراءات"?"col-action":undefined} style={{padding:"13px 16px",fontWeight:700}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pg.rows.map((u,i)=>{
                const rc=ROLE_COLORS[u.role];
                return (
                  <tr key={u.id} style={{borderTop:`1px solid ${B.border}`,background:i%2===0?"#fff":"#FDFCFA"}}>
                    <td style={{padding:"14px 16px"}}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center font-extrabold text-sm flex-shrink-0"
                          style={{background:B.gold,color:B.black}}>{u.name[0]}</div>
                        <span className="font-bold" style={{color:B.black}}>{u.name}</span>
                      </div>
                    </td>
                    <td style={{padding:"14px 16px",fontFamily:"var(--font-app)",color:B.muted,fontSize:13}}>{u.email}</td>
                    <td style={{padding:"14px 16px"}}>
                      <span className="px-3 py-1 rounded-full text-xs font-bold" style={{background:rc.bg,color:rc.fg}}>{u.role}</span>
                    </td>
                    <td style={{padding:"14px 16px",color:B.text2,fontSize:13}}>{branchName(u.branchId)??<span style={{color:B.muted}}>كل الفروع</span>}</td>
                    <td style={{padding:"14px 16px",color:u.lastLogin&&u.lastLogin!=="—"?B.text2:B.muted,fontSize:12,fontFamily:"var(--font-app)",whiteSpace:"nowrap"}} title={u.lastLogin==="—"?"لم يدخل بعد — أو الترحيل 20260915 لم يُشغَّل":undefined}>{u.lastLogin&&u.lastLogin!=="—"?u.lastLogin:"لم يدخل بعد"}</td>
                    <td style={{padding:"14px 16px"}}><StatusBadge status={u.status} entity="user"/></td>
                    <td className="col-action" style={{padding:"14px 16px"}}>
                      <div className="flex gap-2">
                        <button onClick={()=>{setEditTarget(u);setShowModal(true);}} className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                          style={{background:"#fff",color:B.text2,border:`1px solid ${B.border}`}}>تعديل</button>
                        {isSupabaseEnabled&&<button onClick={()=>resend(u)} title="إعادة إرسال رابط تعيين كلمة المرور" className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                          style={{background:"#fff",color:B.text2,border:`1px solid ${B.border}`}}>دعوة</button>}
                        <button onClick={()=>toggleStatus(u.id)} disabled={currentUser?.id===u.id} title={currentUser?.id===u.id?"لا يمكنك إيقاف حسابك":undefined} className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                          style={{background:u.status==="active"?"#FBF3D6":"#E3F3E8",color:u.status==="active"?"#8A6A08":"#1E7A44",border:`1px solid ${u.status==="active"?"#F0E3AE":"#C4E4CE"}`,opacity:currentUser?.id===u.id?0.45:1}}>
                          {u.status==="active"?"إيقاف":"تفعيل"}
                        </button>
                        <button onClick={()=>setDeleteId(u.id)} disabled={currentUser?.id===u.id} className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                          style={{background:"#FBF3D6",color:"#8A6A08",border:"1px solid #E8D9A8",opacity:currentUser?.id===u.id?0.45:1}}>أرشفة</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length===0&&<tr><td colSpan={7} style={{padding:"48px 16px",textAlign:"center",color:B.muted}}>لا يوجد مستخدمون مطابقون</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
        {/* Mobile cards */}
        <div className="md:hidden flex flex-col gap-3">
          {pg.rows.map(u=>{
            const rc=ROLE_COLORS[u.role];
            return (
              <motion.div key={u.id} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}}
                className="rounded-2xl p-4" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-extrabold flex-shrink-0"
                    style={{background:B.gold,color:B.black}}>{u.name[0]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm" style={{color:B.black}}>{u.name}</div>
                    <div className="text-xs font-mono truncate" style={{color:B.muted}}>{u.email}</div>
                  </div>
                  <StatusBadge status={u.status} entity="user"/>
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
        </EntityGate>
        <Pager p={pg} unit="مستخدم"/>
      </main>
      <AnimatePresence>
        {showModal&&<UserModal user={editTarget||{}} others={users} onSave={saveUser} onClose={()=>{setShowModal(false);setEditTarget(null);}}/>}
        {deleteId&&<DeleteDialog onConfirm={reason=>archiveUser(deleteId, reason)} onCancel={()=>setDeleteId(null)}/>}
      </AnimatePresence>
    </div>
  );
}
