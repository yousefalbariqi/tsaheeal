import { useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Plus, Building, MapPin, Phone, ExternalLink, CheckCircle2, AlertTriangle, Pencil, Archive, CirclePause, CirclePlay, SearchX } from "lucide-react";
import { B, TONE } from "@/lib/theme";
import { useDebounced } from "@/lib/useDebounced";
import { checkMapUrl, mapEmbedUrl, type MapUrlVerdict } from "@/lib/maps";
import { phoneError, formatPhone } from "@/lib/phone";
import type { Branch } from "@/types";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { DeleteDialog } from "@/components/DeleteDialog";
import { AppSelect } from "@/components/AppSelect";
import { useStore } from "@/store/useStore";
import { setArchiveReason } from "@/data/repository";
import { newId } from "@/lib/utils";
import { useRole } from "@/lib/useRole";
import { toast } from "sonner";
import { Field } from "@/components/Field";
import { Pager, usePaged } from "@/components/Pager";
import { EntityGate, EmptyState } from "@/components/States";
import { StatusBadge } from "@/components/StatusBadge";
import { useConfirmDiscard } from "@/lib/useUnsavedGuard";
import { Badge, Button, FilterChips, IconButton, Modal, Note, SortTh, useSort, type ChipOption } from "@/components/ui";

const EMPTY: Omit<Branch,"id"> = { name:"", city:"", address:"", gmapUrl:"", phone:"", managerId:"", isActive:true };
const NONE = "__none__";

/* معاينة الموقع قبل الحفظ.

   رابطٌ يُلصق ولا يُفتح يُكتشف خطؤه يوم الانطلاق. المعاينة تجعل الخطأ
   مرئياً في اللحظة التي يُرتكب فيها — وهي أرخص لحظة لتصحيحه.

   وحين يتعذّر الاستخراج (رابط مختصر) لا يُعرض إطارٌ فارغ يُوهم بالفشل:
   يُعرض زرّ فتحٍ في تبويب جديد. الغرض أن يرى الموظف الموقع، لا أن يراه
   داخل الصفحة بالضرورة. */
function MapPreview({verdict,url}:{verdict:MapUrlVerdict;url:string}) {
  if(!url.trim()) return null;
  if(!verdict.ok) return null;              /* الخطأ يظهر في <Err/> لا مرّتين */
  const embed=mapEmbedUrl(url);
  return (
    <div className="mt-2 overflow-hidden" style={{borderRadius:12,border:`1px solid ${B.border}`}}>
      <div className="flex items-center gap-2 px-3 py-2" style={{background:TONE.success.bg,borderBottom:embed?`1px solid ${B.border}`:"none"}}>
        <CheckCircle2 size={14} style={{color:TONE.success.fg,flexShrink:0}}/>
        <span className="text-xs font-bold" style={{color:TONE.success.fg}}>رابط خرائط صالح</span>
        <a href={url} target="_blank" rel="noreferrer" className="ui-btn ui-btn--link ms-auto" style={{fontSize:12,gap:4}}>
          <ExternalLink size={12}/>افتح في تبويب جديد
        </a>
      </div>
      {embed
        ? <iframe src={embed} title="معاينة موقع الفرع" loading="lazy" referrerPolicy="no-referrer"
            style={{width:"100%",height:180,border:"none",display:"block"}}/>
        : <div className="px-3 py-2 text-xs" style={{color:B.muted}}>رابط مختصر — لا تُستخرج منه الإحداثيات للمعاينة. افتحه للتأكّد من الموقع.</div>}
    </div>
  );
}

/* زرّ الأرشفة ومانعه.

   المانع يُعرض بنصّه لا يُخفى الزرّ: زرٌّ غائب يجعل الموظف يظنّ أن
   الصلاحية ناقصة، ونصُّ المانع يقول له ما يفعله بدلاً منه. */
function ArchiveBranchButton({branch,links,onArchive,outline}:{branch:Branch;links:string[];onArchive:()=>void;outline?:boolean}) {
  const blocked=links.length>0;
  return (
    <IconButton size="sm" variant={outline?"outline":"ghost"}
      label={blocked?`لا يُؤرشَف — مرتبط: ${links.join(" · ")}`:`أرشفة ${branch.name}`}
      style={blocked?{color:B.placeholder}:undefined}
      onClick={()=>{ if(blocked){ toast.error("لا يمكن أرشفة فرع مرتبط",{description:`${links.join(" · ")} — عطّله بدل أرشفته.`,duration:8000}); return; } onArchive(); }}>
      <Archive size={15}/>
    </IconButton>
  );
}

function BranchModal({branch,managers,onSave,onClose}:{
  branch:Partial<Branch>;
  managers:{id:string;name:string}[];
  onSave:(b:Partial<Branch>)=>Promise<void>|void;
  onClose:()=>void;
}) {
  const [form,setForm]=useState<Omit<Branch,"id">&{id?:string}>({...EMPTY,...branch});
  const [errors,setErrors]=useState<{[k:string]:string}>({});
  const [busy,setBusy]=useState(false);
  const requestClose=useConfirmDiscard(form,onClose);
  const set=<K extends keyof typeof form>(k:K,v:(typeof form)[K])=>setForm(f=>({...f,[k]:v}));
  function validate(){
    const e:{[k:string]:string}={};
    if(!form.name.trim())    e.name="اسم الفرع مطلوب";
    if(!form.city.trim())    e.city="المدينة مطلوبة";
    if(!form.address.trim()) e.address="العنوان التفصيلي مطلوب";
    /* التحقّق من lib/phone لا نمطٌ محلّي: `[+0-9\s]{7,}` كان يقبل
       «+++    » وثمانية أصفار. ورقم الفرع أرضيٌّ غالباً، وهي الحالة
       التي بُنيت لها الدالّة. */
    const pe=phoneError(form.phone,{required:false});
    if(pe) e.phone=pe;
    /* المسؤول شرطُ التفعيل لا شرطُ الوجود: فرعٌ نشط بلا مسؤول يستقبل
       طلباً لا يملك أحدٌ متابعته، بينما الفرع المعطَّل سجلٌّ لا يعمل
       فلا يُطلَب له مسؤول. الشرط يتبع الحالة لا العكس. */
    if(form.isActive && !form.managerId) e.managerId="الفرع النشط يلزمه مسؤول — أو اجعله غير نشط.";
    const mv=checkMapUrl(form.gmapUrl);
    if(!mv.ok && mv.reason) e.gmapUrl=mv.reason;
    setErrors(e);
    return Object.keys(e).length===0;
  }
  async function handleSave(){
    if(busy) return;
    if(!validate()) return;
    setBusy(true);
    try { await onSave({...form,city:form.city.trim()}); } finally { setBusy(false); }
  }
  const req=<span className="ui-req">*</span>;
  const mapCheck=checkMapUrl(form.gmapUrl);

  return (
    <Modal open onClose={requestClose} width={620}
      title={branch.id?"تعديل فرع":"إضافة فرع جديد"}
      footer={<>
        <Button variant="primary" loading={busy} onClick={handleSave}>{busy?"جارٍ الحفظ…":"حفظ الفرع"}</Button>
        <Button variant="secondary" disabled={busy} onClick={requestClose}>إلغاء</Button>
      </>}>
      <form className="grid grid-cols-1 sm:grid-cols-2 gap-4" onSubmit={e=>{e.preventDefault();void handleSave();}} noValidate>
        <div className="sm:col-span-2">
          <Field label={<>اسم الفرع{req}</>} error={errors.name}>
            <input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="فرع الرياض — العليا" className="ui-input" aria-invalid={!!errors.name}/>
          </Field>
        </div>
        <div>
          <Field label={<>المدينة{req}</>} error={errors.city}>
            <input value={form.city} onChange={e=>set("city",e.target.value)} placeholder="مثال: الدمام" className="ui-input" aria-invalid={!!errors.city}/>
          </Field>
        </div>
        <div>
          {/* «رقم جوال» ومثالٌ لهاتفٍ ثابت: الاسم كان يَعِد بما لا يقبله
              الحقل ولا يحويه. الفرع يُتّصل به على ثابتٍ أو جوال، فالاسم
              «رقم التواصل» — وهو ما يصف الحقل بصدق. */}
          <Field label="رقم التواصل" error={errors.phone}>
            <input value={form.phone} onChange={e=>set("phone",e.target.value)} placeholder="05x xxx xxxx" className="ui-input" dir="ltr" inputMode="tel" style={{textAlign:"right"}} aria-invalid={!!errors.phone}/>
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={<>العنوان التفصيلي{req}</>} error={errors.address}>
            <input value={form.address} onChange={e=>set("address",e.target.value)} placeholder="طريق الملك فهد، حي العليا" className="ui-input" aria-invalid={!!errors.address}/>
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="رابط Google Maps" error={errors.gmapUrl}>
            <input value={form.gmapUrl} onChange={e=>set("gmapUrl",e.target.value)} placeholder="https://maps.google.com/…" className="ui-input" dir="ltr" inputMode="url"
              style={{textAlign:"right"}} aria-invalid={!!mapCheck.reason||!!errors.gmapUrl}/>
          </Field>
          <MapPreview verdict={mapCheck} url={form.gmapUrl}/>
        </div>
        <div>
          <Field label={<>المسؤول عن الفرع{form.isActive?req:null}</>} error={errors.managerId}>
            <AppSelect value={form.managerId||NONE} placeholder="اختر المسؤول" invalid={!!errors.managerId}
              onChange={v=>set("managerId",v===NONE?"":v)}
              options={[{value:NONE,label:"بدون مسؤول"},...managers.map(m=>({value:m.id,label:m.name}))]}/>
          </Field>
        </div>
        <div>
          <Field label="الحالة">
            <AppSelect value={form.isActive?"active":"inactive"}
              onChange={v=>set("isActive",v==="active")}
              options={[{value:"active",label:"نشط"},{value:"inactive",label:"غير نشط"}]}/>
          </Field>
        </div>
        <button type="submit" hidden/>
      </form>
    </Modal>
  );
}

type StatusFilter = "all"|"active"|"inactive";

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
  const trips = useStore(s=>s.trips);
  const bookings = useStore(s=>s.bookings);
  const [search,setSearch]=useState("");
  /* التصفية على القيمة الساكنة لا على كل ضغطة مفتاح. */
  const query = useDebounced(search);
  const [showModal,setShowModal]=useState(false);
  const [editTarget,setEditTarget]=useState<Branch|null>(null);
  const [delId,setDelId]=useState<string|null>(null);

  const managers = useMemo(()=>users.map(u=>({id:u.id,name:u.name})),[users]);
  const managerName=(id:string)=>users.find(u=>u.id===id)?.name??"—";

  const [statusFilter,setStatusFilter]=useState<StatusFilter>("all");
  const filtered = useMemo(()=>{
    const q=query.trim();
    return branches.filter(b=>
      (statusFilter==="all"||(statusFilter==="active")===b.isActive) &&
      (!q || b.name.includes(q) || b.city.includes(q) || b.address.includes(q) || b.phone.includes(q)));
  },[branches,query,statusFilter]);
  /* الفرز قبل القصّ على الصفحات. */
  const sorter = useSort(filtered, useMemo(()=>({
    name:(b:Branch)=>b.name,
    city:(b:Branch)=>b.city,
    manager:(b:Branch)=>b.managerId?(users.find(u=>u.id===b.managerId)?.name??""):null,
    status:(b:Branch)=>b.isActive?0:1,
  }),[users]));

  /* ترقيم الصفحات — الرسم على الصفحة الحالية وحدها. المفتاح يُعيد
     للصفحة الأولى عند تغيّر البحث أو المرشّح: من كان في الصفحة الخامسة
     ثم بحث عن اسم يجب أن يرى أول النتائج لا صفحتها الخامسة. */
  const pg = usePaged(sorter.rows, `${query}|${statusFilter}`);

  /* الفروع النشطة بلا مسؤول: التحقّق يمنع الجديد، لكنّ القديم موجود
     أصلاً بلا مسؤول ولن يمرّ على النموذج ما لم يُفتح. الرقم هنا يجعله
     مرئياً في الصفحة الأولى بدل انتظار أن يعثر عليه أحد. */
  const unassigned = branches.filter(b=>b.isActive && !b.managerId);
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
  function removeBranch(id:string, reason:string){ setArchiveReason(reason); setBranches(prev=>prev.filter(b=>b.id!==id)); setDelId(null); }

  /* ١٧) الفرع المرتبط لا يُحذف ولا يُؤرشَف: الرحلة تحمل نقطة انطلاقها
     والفاتورة تحمل فرع إصدارها، وإخفاء الصفّ يترك مرجعاً معلّقاً في
     مستنداتٍ صدرت لعملاء. البديل هو التعطيل — يمنع الجديد ويُبقي
     القديم مفسَّراً، وهو ما يطلبه الفريق نصّاً. */
  function branchLinks(id:string):string[] {
    const out:string[]=[];
    const t=trips.filter(x=>x.branchId===id).length;
    if(t) out.push(`${t} ${t===1?"رحلة":"رحلة"} تنطلق منه`);
    const b=bookings.filter(x=>x.branchId===id).length;
    if(b) out.push(`${b} ${b===1?"طلب":"طلباً"} صادرة عنه`);
    const u=users.filter(x=>x.id===branches.find(y=>y.id===id)?.managerId).length;
    if(u) out.push("مسؤول معيَّن عليه");
    return out;
  }
  function toggleActive(b:Branch){ setBranches(prev=>prev.map(x=>x.id===b.id?{...x,isActive:!x.isActive}:x)); }

  const gmapCell=(url:string)=> url
    ? <a href={url} target="_blank" rel="noreferrer" className="ui-btn ui-btn--link" style={{fontSize:13,gap:4}}><MapPin size={13}/>خريطة</a>
    : <span style={{color:B.muted}}>—</span>;
  const statusChips:ChipOption<StatusFilter>[]=[
    {value:"all",label:"الكل",count:stats.total},
    {value:"active",label:"نشطة",count:stats.active},
    {value:"inactive",label:"غير نشطة",count:stats.inactive},
  ];
  const filteredOut=filtered.length===0&&branches.length>0;
  const iconTile=(size:number)=>(
    <span aria-hidden className="flex items-center justify-center flex-shrink-0" style={{width:size,height:size,borderRadius:10,background:B.fill,color:B.text2,border:`1px solid ${B.border}`}}><Building size={size*0.44}/></span>
  );
  const manager=(b:Branch)=> b.managerId
    ? managerName(b.managerId)
    : b.isActive
      ? <Badge tone="warn" size="sm"><AlertTriangle size={11}/>بلا مسؤول</Badge>
      : <span style={{color:B.muted}}>—</span>;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background: B.bg}}>
      <PageHeader title="الفروع" crumb="إدارة الفروع" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}
        /* زرّ الإضافة يُخفى لا يُعطَّل: زرٌّ مرئي يعد بعملٍ لا يُنجَز. */
        actions={mayWrite&&<Button variant="primary" icon={<Plus size={16}/>} onClick={()=>openForm(null)}>
          <span className="hidden sm:inline">إضافة فرع</span><span className="sm:hidden">إضافة</span>
        </Button>}/>
      <div className="px-4 md:px-8 pt-1">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="إجمالي الفروع" value={stats.total} sub="في السجل" accent onClick={()=>setStatusFilter("all")}/>
          <StatCard label="فروع نشطة" value={stats.active} sub="تستقبل الطلبات" onClick={()=>setStatusFilter("active")}/>
          <StatCard label="غير نشطة" value={stats.inactive} sub="معطّلة" onClick={()=>setStatusFilter("inactive")}/>
          <StatCard label="المدن" value={stats.cities} sub="مدينة مغطّاة"/>
        </div>
        {unassigned.length>0&&(
          <Note tone="warn" icon={<AlertTriangle size={15}/>} className="mt-3">
            <b>{unassigned.length}</b> {unassigned.length===1?"فرع نشط":"فروع نشطة"} بلا مسؤول — الطلبات الواردة إليها لا يتابعها أحد: {unassigned.map(b=>b.name).join(" · ")}
          </Note>
        )}
        <div className="ts-toolbar">
          <FilterChips label="حالة الفرع" options={statusChips} value={statusFilter} onChange={v=>setStatusFilter(v)}/>
          <span className="ts-toolbar-end ts-count" aria-live="polite">{filtered.length===branches.length?`${branches.length} فرع`:`${filtered.length} من ${branches.length}`}</span>
        </div>
      </div>

      <main className="flex-1 px-4 md:px-8 pb-8">
        <EntityGate entity="branches" label="الفروع" cols={6}>
        {filtered.length===0 ? (
          <EmptyState icon={filteredOut?<SearchX size={22}/>:<Building size={22}/>}
            title={filteredOut?"لا فروع تطابق البحث":"لا فروع بعد"}
            note={filteredOut?"جرّب اسماً أو مدينةً أخرى، أو أزل المرشّح.":"أضف أول فرع لتُسنَد إليه الرحلات والطلبات."}
            action={filteredOut
              ? <Button variant="secondary" onClick={()=>{setSearch("");setStatusFilter("all");}}>إزالة المرشّحات</Button>
              : mayWrite&&<Button variant="primary" icon={<Plus size={16}/>} onClick={()=>openForm(null)}>إضافة فرع</Button>}/>
        ) : <>
        {/* Desktop table */}
        <div className="hidden md:block ui-table-wrap">
          <div className="ui-table-scroll">
          <table className="ui-table" style={{minWidth:820}}>
            <thead>
              <tr>
                <SortTh k="name" sorter={sorter}>الفرع</SortTh>
                <SortTh k="city" sorter={sorter}>المدينة والعنوان</SortTh>
                <th>التواصل</th>
                <SortTh k="manager" sorter={sorter}>المسؤول</SortTh>
                <SortTh k="status" sorter={sorter}>الحالة</SortTh>
                <th className="col-action"><span className="sr-only">إجراءات</span></th>
              </tr>
            </thead>
            <tbody>
              {pg.rows.map(b=>(
                <tr key={b.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      {iconTile(36)}
                      <span className="cell-main nowrap">{b.name}</span>
                    </div>
                  </td>
                  <td style={{maxWidth:280}}>
                    <div style={{color:B.text3}}>{b.city}</div>
                    <div className="cell-sub truncate" title={b.address}>{b.address}</div>
                  </td>
                  <td className="nowrap">
                    <div className="num" style={{color:B.text2,fontSize:13,textAlign:"start"}}>{b.phone?formatPhone(b.phone):"—"}</div>
                    <div style={{marginTop:2}}>{gmapCell(b.gmapUrl)}</div>
                  </td>
                  <td className="nowrap" style={{color:B.text3}}>{manager(b)}</td>
                  <td><StatusBadge status={b.isActive?"active":"inactive"} entity="branch"/></td>
                  <td className="col-action">
                    <div className="row-actions">
                      <IconButton size="sm" label={`تعديل ${b.name}`} onClick={()=>openForm(b)}><Pencil size={15}/></IconButton>
                      <IconButton size="sm" label={b.isActive?"تعطيل الفرع":"تفعيل الفرع"} onClick={()=>toggleActive(b)}>
                        {b.isActive?<CirclePause size={15}/>:<CirclePlay size={15}/>}
                      </IconButton>
                      <ArchiveBranchButton branch={b} links={branchLinks(b.id)} onArchive={()=>setDelId(b.id)}/>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        {/* Mobile cards — الأفعال نفسها التي في صفّ المكتب. */}
        <div className="md:hidden flex flex-col gap-2.5">
          {pg.rows.map(b=>(
            <div key={b.id} className="ui-card p-4">
              <div className="flex items-center gap-3">
                {iconTile(40)}
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate" style={{color:B.black,fontSize:15}}>{b.name}</div>
                  <div className="text-xs" style={{color:B.muted}}>{b.city}</div>
                </div>
                <StatusBadge status={b.isActive?"active":"inactive"} entity="branch"/>
              </div>
              <div className="text-sm mt-3" style={{color:B.text2}}>{b.address}</div>
              <div className="flex items-center gap-3 flex-wrap mt-2 text-xs" style={{color:B.text2}}>
                {b.phone&&<span className="inline-flex items-center gap-1" dir="ltr"><Phone size={12}/>{formatPhone(b.phone)}</span>}
                {gmapCell(b.gmapUrl)}
                <span className="inline-flex items-center gap-1">المسؤول: {manager(b)}</span>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3" style={{borderTop:`1px solid ${B.border}`}}>
                <Button size="sm" variant="secondary" icon={<Pencil size={14}/>} onClick={()=>openForm(b)}>تعديل</Button>
                <Button size="sm" variant="secondary" onClick={()=>toggleActive(b)}>{b.isActive?"تعطيل":"تفعيل"}</Button>
                <span className="ms-auto"><ArchiveBranchButton outline branch={b} links={branchLinks(b.id)} onArchive={()=>setDelId(b.id)}/></span>
              </div>
            </div>
          ))}
        </div>
        </>}
        </EntityGate>
        <Pager p={pg} unit="فرع"/>
      </main>

      <AnimatePresence>
        {showModal&&<BranchModal branch={editTarget||{}} managers={managers} onSave={saveBranch} onClose={()=>{setShowModal(false);setEditTarget(null);}}/>}
        {delId&&<DeleteDialog onConfirm={reason=>removeBranch(delId, reason)} onCancel={()=>setDelId(null)}/>}
      </AnimatePresence>
    </div>
  );
}
