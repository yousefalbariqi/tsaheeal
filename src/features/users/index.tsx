import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { Plus, Mail, Building2, Pencil, Send, Archive, CirclePause, CirclePlay, AlertCircle, SearchX, Users as UsersIcon } from "lucide-react";
import { B, type ToneName } from "@/lib/theme";
import { useDebounced } from "@/lib/useDebounced";
import type { UserRole, SystemUser } from "@/types";
import { StatusBadge } from "@/components/StatusBadge";
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
import { EntityGate, EmptyState } from "@/components/States";
import { useConfirmDiscard } from "@/lib/useUnsavedGuard";
import { fmtDateTime } from "@/lib/dates";
import { Badge, Button, FilterChips, IconButton, Modal, Note, Segmented, SortTh, useSort, type ChipOption } from "@/components/ui";

/* لون الدور من ألوان المعنى: المدير العام ذهبي، مدير النظام أزرق، والموظف محايد. */
const ROLE_TONE:Record<UserRole,ToneName> = {
  "مدير عام":     "gold",
  "مدير النظام":  "info",
  "موظف":         "neutral",
};
const ROLES:UserRole[] = ["مدير عام","مدير النظام","موظف"];

/** الحرف الأول في دائرةٍ هادئة — كانت كتلةً ذهبية في كل صفّ. */
function Avatar({name,size=36}:{name:string;size?:number}) {
  return (
    <span aria-hidden className="flex items-center justify-center flex-shrink-0"
      style={{width:size,height:size,borderRadius:999,background:B.fill,color:B.text3,fontSize:size*0.4,fontWeight:600,border:`1px solid ${B.border}`}}>
      {name.trim().charAt(0)||"؟"}
    </span>
  );
}

type StatusFilter = "all"|"active"|"inactive";
const SORT = {
  name:(u:SystemUser)=>u.name,
  role:(u:SystemUser)=>u.role,
  lastLogin:(u:SystemUser)=>u.lastLogin&&u.lastLogin!=="—"?u.lastLogin:null,
  status:(u:SystemUser)=>u.status,
};

const EMPTY_USER:Omit<SystemUser,"id"|"lastLogin"> = { name:"", email:"", role:"موظف", status:"active" };

const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function UserModal({user,others,onSave,onClose}:{user:Partial<SystemUser>;others:SystemUser[];onSave:(u:Partial<SystemUser>)=>Promise<string|void>;onClose:()=>void}) {
  const branches=useStore(s=>s.branches);
  const [form,setForm]=useState({...EMPTY_USER,...user});
  const [err,setErr]=useState("");
  const [busy,setBusy]=useState(false);
  const [tried,setTried]=useState(false);
  const requestClose=useConfirmDiscard(form,onClose);
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
    <Modal open onClose={requestClose} width={520}
      title={isEdit?"تعديل بيانات المستخدم":"دعوة مستخدم جديد"}
      footer={<>
        <Button variant="primary" loading={busy} onClick={submit}>{busy?"جارٍ الحفظ…":isEdit?"حفظ التعديلات":"إرسال الدعوة"}</Button>
        <Button variant="secondary" onClick={requestClose} disabled={busy}>إلغاء</Button>
      </>}>
      <form className="flex flex-col gap-4" onSubmit={e=>{e.preventDefault();void submit();}} noValidate>
        <div>
          <Field label={<>الاسم الكامل<span className="ui-req">*</span></>} error={tried?errors.name:undefined}>
            <input value={form.name} onChange={e=>f("name")(e.target.value)} placeholder="الاسم الكامل" aria-invalid={tried&&!!errors.name}
              className="ui-input" autoComplete="off"/>
          </Field>
        </div>
        <div>
          <Field label={<>البريد الإلكتروني<span className="ui-req">*</span></>} error={tried?errors.email:undefined}
            hint={isEdit?"البريد هو هوية الدخول ولا يُعدَّل.":undefined}>
            <input value={form.email} onChange={e=>f("email")(e.target.value)} placeholder="name@company.sa" type="email" disabled={isEdit} aria-invalid={tried&&!!errors.email}
              className="ui-input" dir="ltr" style={{textAlign:"right"}} autoComplete="off"/>
          </Field>
        </div>
        {/* لا حقل كلمة مرور: المدير لا يعرف كلمة أحد. تُرسَل دعوةٌ يضبط
            فيها المستخدم كلمته بنفسه وفق السياسة (١٢ محرفاً فأكثر). */}
        {!isEdit && isSupabaseEnabled && (
          <Note tone="success" icon={<Mail size={15}/>}>
            يصل المستخدم بريدٌ فيه رابطٌ يختار به كلمة مروره بنفسه ({PASSWORD_MIN} محرفاً فأكثر). لا كلمة تُكتب هنا ولا تُرسَل في رسالة.
          </Note>
        )}
        <div>
          <span className="ui-label">الدور</span>
          <Segmented label="الدور" value={form.role as UserRole} onChange={r=>f("role")(r)}
            options={ROLES.map(r=>({value:r,label:r}))}/>
        </div>
        {/* الفرع يقصّ نطاق البيانات في القاعدة (RLS): موظفٌ بفرعٍ يرى حجوزات
            فرعه؛ بلا فرع يرى الكل؛ والمدير يرى الكل أياً كان فرعه. */}
        <div>
          <Field label={<span className="inline-flex items-center gap-1.5"><Building2 size={13}/>الفرع</span>}
            hint={form.role==="موظف"
              ? (form.branchId?"يرى حجوزات هذا الفرع ورحلاته وفواتيره وتذاكره فقط.":"بلا فرع: يرى كل الحجوزات. اختر فرعاً لقصر نطاقه.")
              : "المدير يرى كل الفروع مهما كان فرعه — الفرع هنا للعرض والتعيين."}>
            <AppSelect value={form.branchId??""} placeholder="كل الفروع" onChange={v=>f("branchId")(v)}
              options={[{value:"",label:"— كل الفروع —"},...activeBranches.map(b=>({value:b.id,label:`${b.name} · ${b.city}`}))]}/>
          </Field>
        </div>
        {err && <Note tone="danger" icon={<AlertCircle size={15}/>}>{err}</Note>}
        {/* زرّ خفيّ ليُرسَل النموذج بـEnter — الأزرار الظاهرة في ذيل النافذة خارج <form>. */}
        <button type="submit" hidden/>
      </form>
    </Modal>
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

  const [statusFilter,setStatusFilter]=useState<StatusFilter>("all");

  const filtered = users.filter(u=>
    (statusFilter==="all"||(statusFilter==="active")===(u.status==="active"))&&
    (!query||(u.name+u.email+u.role).toLowerCase().includes(query.toLowerCase()))
  );
  /* الفرز قبل القصّ على الصفحات: فرزُ صفحةٍ واحدة يُظهر «الأعلى» من خمسةٍ
     وعشرين لا من الكل. */
  const sorter = useSort(filtered, SORT);

  /* ترقيم الصفحات — الرسم على الصفحة الحالية وحدها. المفتاح يُعيد
     للصفحة الأولى عند تغيّر البحث أو المرشّح: من كان في الصفحة الخامسة
     ثم بحث عن اسم يجب أن يرى أول النتائج لا صفحتها الخامسة. */
  const pg = usePaged(sorter.rows, `${query}|${statusFilter}`);

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

  const statusChips:ChipOption<StatusFilter>[]=[
    {value:"all",label:"الكل",count:stats.total},
    {value:"active",label:"نشطون",count:stats.active},
    {value:"inactive",label:"موقوفون",count:stats.total-stats.active},
  ];
  const self=(u:SystemUser)=>currentUser?.id===u.id;
  const lastLogin=(u:SystemUser)=>u.lastLogin&&u.lastLogin!=="—"?fmtDateTime(u.lastLogin):null;
  const openAdd=()=>{setEditTarget(null);setShowModal(true);};
  const openEdit=(u:SystemUser)=>{setEditTarget(u);setShowModal(true);};
  const filteredOut=filtered.length===0&&users.length>0;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background: B.bg}}>
      <PageHeader title="المستخدمون" crumb="إدارة المستخدمين" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}
        actions={<Button variant="primary" icon={<Plus size={16}/>} onClick={openAdd}>
          <span className="hidden sm:inline">دعوة مستخدم</span><span className="sm:hidden">دعوة</span>
        </Button>}/>
      <div className="px-4 md:px-8 pt-1">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="إجمالي المستخدمين" value={stats.total} sub="في النظام" accent onClick={()=>setStatusFilter("all")}/>
          <StatCard label="نشطون" value={stats.active} sub="يمكنهم الدخول" onClick={()=>setStatusFilter("active")}/>
          <StatCard label="موقوفون" value={stats.total-stats.active} sub="مُعطَّل الوصول" onClick={()=>setStatusFilter("inactive")}/>
          <StatCard label="المدراء" value={stats.admins} sub="صلاحيات عليا"/>
        </div>
        <div className="ts-toolbar">
          <FilterChips label="حالة الحساب" options={statusChips} value={statusFilter} onChange={v=>setStatusFilter(v)}/>
          <span className="ts-toolbar-end ts-count" aria-live="polite">{filtered.length===users.length?`${users.length} مستخدم`:`${filtered.length} من ${users.length}`}</span>
        </div>
      </div>
      <main className="flex-1 px-4 md:px-8 pb-8">
        <EntityGate entity="users" label="المستخدمين" cols={6}>
        {filtered.length===0 ? (
          <EmptyState icon={filteredOut?<SearchX size={22}/>:<UsersIcon size={22}/>}
            title={filteredOut?"لا مستخدمين يطابقون البحث":"لا مستخدمين بعد"}
            note={filteredOut?"جرّب اسماً أو بريداً آخر، أو أزل المرشّح.":"ادعُ أول موظف ليصله رابط تعيين كلمة المرور."}
            action={filteredOut
              ? <Button variant="secondary" onClick={()=>{setSearch("");setStatusFilter("all");}}>إزالة المرشّحات</Button>
              : <Button variant="primary" icon={<Plus size={16}/>} onClick={openAdd}>دعوة مستخدم</Button>}/>
        ) : <>
        {/* Desktop table */}
        <div className="hidden md:block ui-table-wrap">
          <div className="ui-table-scroll">
          <table className="ui-table" style={{minWidth:760}}>
            <thead>
              <tr>
                <SortTh k="name" sorter={sorter}>المستخدم</SortTh>
                <SortTh k="role" sorter={sorter}>الدور</SortTh>
                <th>الفرع</th>
                <SortTh k="lastLogin" sorter={sorter}>آخر دخول</SortTh>
                <SortTh k="status" sorter={sorter}>الحالة</SortTh>
                <th className="col-action"><span className="sr-only">إجراءات</span></th>
              </tr>
            </thead>
            <tbody>
              {pg.rows.map(u=>(
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name}/>
                      <div className="min-w-0">
                        <div className="cell-main nowrap">{u.name}{self(u)&&<span style={{color:B.muted,fontWeight:400}}> (أنت)</span>}</div>
                        <div className="cell-sub" dir="ltr" style={{textAlign:"right"}}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><Badge tone={ROLE_TONE[u.role]}>{u.role}</Badge></td>
                  <td className="nowrap" style={{color:B.text2,fontSize:13}}>{branchName(u.branchId)??<span style={{color:B.muted}}>كل الفروع</span>}</td>
                  <td className="nowrap" style={{color:lastLogin(u)?B.text2:B.muted,fontSize:13}} title={u.lastLogin==="—"?"لم يدخل بعد — أو الترحيل 20260915 لم يُشغَّل":undefined}>{lastLogin(u)??"لم يدخل بعد"}</td>
                  <td><StatusBadge status={u.status} entity="user"/></td>
                  <td className="col-action">
                    <div className="row-actions">
                      <IconButton size="sm" label="تعديل" onClick={()=>openEdit(u)}><Pencil size={15}/></IconButton>
                      {isSupabaseEnabled&&<IconButton size="sm" label="إعادة إرسال رابط تعيين كلمة المرور" onClick={()=>resend(u)}><Send size={15}/></IconButton>}
                      <IconButton size="sm" disabled={self(u)} label={self(u)?"لا يمكنك إيقاف حسابك":u.status==="active"?"إيقاف الحساب":"تفعيل الحساب"} onClick={()=>toggleStatus(u.id)}>
                        {u.status==="active"?<CirclePause size={15}/>:<CirclePlay size={15}/>}
                      </IconButton>
                      <IconButton size="sm" disabled={self(u)} label={self(u)?"لا يمكنك أرشفة حسابك":"أرشفة"} onClick={()=>setDeleteId(u.id)}><Archive size={15}/></IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        {/* Mobile cards — الأفعال نفسها التي في صفّ المكتب، لا بعضها. */}
        <div className="md:hidden flex flex-col gap-2.5">
          {pg.rows.map(u=>(
            <div key={u.id} className="ui-card p-4">
              <div className="flex items-center gap-3">
                <Avatar name={u.name} size={40}/>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate" style={{color:B.black,fontSize:15}}>{u.name}</div>
                  <div className="text-xs truncate" dir="ltr" style={{color:B.muted,textAlign:"right"}}>{u.email}</div>
                </div>
                <StatusBadge status={u.status} entity="user"/>
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-3 text-xs" style={{color:B.muted}}>
                <Badge tone={ROLE_TONE[u.role]} size="sm">{u.role}</Badge>
                <span>{branchName(u.branchId)??"كل الفروع"}</span>
                <span>· {lastLogin(u)??"لم يدخل بعد"}</span>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3" style={{borderTop:`1px solid ${B.border}`}}>
                <Button size="sm" variant="secondary" icon={<Pencil size={14}/>} onClick={()=>openEdit(u)}>تعديل</Button>
                <Button size="sm" variant="secondary" disabled={self(u)} onClick={()=>toggleStatus(u.id)}>{u.status==="active"?"إيقاف":"تفعيل"}</Button>
                <span className="ms-auto flex items-center gap-1">
                  {isSupabaseEnabled&&<IconButton size="sm" variant="outline" label="إعادة إرسال الدعوة" onClick={()=>resend(u)}><Send size={15}/></IconButton>}
                  <IconButton size="sm" variant="outline" disabled={self(u)} label="أرشفة" onClick={()=>setDeleteId(u.id)}><Archive size={15}/></IconButton>
                </span>
              </div>
            </div>
          ))}
        </div>
        </>}
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
