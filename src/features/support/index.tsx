import { useEffect, useState } from "react";
import { X, ImagePlus } from "lucide-react";
import { B } from "@/lib/theme";
import type { SupportPriority, SupportStatus, SupportReq } from "@/types";
import { PageHeader } from "@/components/PageHeader";
import { AppSelect } from "@/components/AppSelect";
import { useStore } from "@/store/useStore";
import { newId } from "@/lib/utils";
import { Field } from "@/components/Field";
import { onPickMedia } from "@/lib/mediaUpload";
import { DEFAULT_SETTINGS, fetchSettings } from "@/data/settings";

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


const SUP_STATUS_LABELS:Record<SupportStatus,string> = {sent:"مُرسَل",reviewing:"قيد المراجعة",resolved:"تم الحل",closed:"مغلق"};
const SUP_STATUS_COLORS:Record<SupportStatus,{bg:string;fg:string}> = {
  sent:     {bg:"#EAF1FE",fg:"#1E52C7"},
  reviewing:{bg:"#FBF3D6",fg:"#8A6A08"},
  resolved: {bg:"#E3F3E8",fg:"#1E7A44"},
  closed:   {bg:"#EEECEA",fg:"#5C554E"},
};

export function SupportPage({onMenuOpen}:{onMenuOpen?:()=>void}) {
  /* بريد الدعم من الإعدادات: كان نصّاً في هذه الشاشة وحدها، فتغييره
     يستلزم تعديل شفرة. الافتراضي هو نفس البريد القائم. */
  const [supportEmail,setSupportEmail]=useState(DEFAULT_SETTINGS.internal.supportEmail);
  useEffect(()=>{ let alive=true;
    fetchSettings().then(c=>{ if(alive) setSupportEmail(c.internal.supportEmail); }).catch(()=>{});
    return ()=>{ alive=false; };
  },[]);
  const [search,setSearch]=useState("");
  const reqs=useStore(s=>s.support); const setReqs=useStore(s=>s.setSupport);
  const [category,setCategory]=useState(SUPPORT_CATS[0]);
  const [title,setTitle]=useState("");
  const [desc,setDesc]=useState("");
  const [priority,setPriority]=useState<SupportPriority>("متوسط");
  const [attachments,setAttachments]=useState<string[]>([]);
  const [sent,setSent]=useState(false);

  function submit() {
    if(!title.trim()) return;
    const nr:SupportReq={
      id:newId("SUP"),
      category, title, desc, priority, status:"sent",
      date:new Date().toISOString().slice(0,10),
    };
    setReqs(p=>[nr,...p]);
    setTitle(""); setDesc(""); setCategory(SUPPORT_CATS[0]); setPriority("متوسط"); setAttachments([]);
    setSent(true);
    setTimeout(()=>setSent(false),3500);
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background:B.bg}}>
      <PageHeader title="الدعم الفني" crumb="إرسال طلب دعم" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>
      <main className="flex-1 px-4 md:px-8 py-6 max-w-5xl">
        {/* Sender info card */}
        <div className="rounded-2xl px-6 py-5 mb-6" style={{background:B.primary}}>
          <div className="text-xs font-bold mb-3" style={{color:"#9DBAB6"}}>بيانات المُرسِل (تلقائي)</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[{l:"الاسم",v:"سالم أحمد"},{l:"الدور",v:"مدير النظام"},{l:"الجوال",v:"0501234567"},{l:"البريد",v:"salem@tasahheel.com"}].map(f=>(
              <div key={f.l}>
                <div className="text-xs mb-0.5" style={{color:"#9DBAB6",fontWeight:600}}>{f.l}</div>
                <div className="font-bold text-sm" style={{color:"#F0E6CC"}}>{f.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ── Form ── */}
          <div className="lg:col-span-3 rounded-2xl p-6" style={{background:"#fff",border:`1px solid ${B.border}`}}>
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
                <label className="block text-xs font-bold mb-2" style={{color:B.text3}}>إرفاق صورة / لقطة شاشة <span className="font-normal" style={{color:B.muted}}>(اختياري)</span></label>
                <div className="flex flex-wrap gap-2 items-center">
                  {attachments.map((url,i)=>(
                    <div key={i} className="relative rounded-xl overflow-hidden" style={{width:72,height:72,border:`1px solid ${B.border}`}}>
                      <img src={url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                      <button onClick={()=>setAttachments(a=>a.filter((_,idx)=>idx!==i))} className="absolute top-0.5 left-0.5 w-5 h-5 rounded-md flex items-center justify-center cursor-pointer" style={{background:"rgba(190,38,38,0.92)",border:"none",color:"#fff"}}><X size={11}/></button>
                    </div>
                  ))}
                  {attachments.length<4&&(
                    <label className="flex flex-col items-center justify-center gap-1 cursor-pointer rounded-xl" style={{width:72,height:72,border:`1.5px dashed ${B.border}`,background:B.bg,color:B.muted}}>
                      <ImagePlus size={18}/><span style={{fontSize:9,fontWeight:700}}>إرفاق</span>
                      <input type="file" accept="image/*" className="hidden" onChange={onPickMedia("support",url=>setAttachments(a=>[...a,url]))}/>
                    </label>
                  )}
                </div>
              </div>
              {/* Submit */}
              <button onClick={submit} disabled={!title.trim()}
                className="w-full py-3 rounded-xl font-extrabold text-base cursor-pointer transition-all"
                style={{background:title.trim()?B.gold:"#D8D0C4",color:title.trim()?B.black:"#9a9186",border:"none"}}>
                {sent?"✓ تم إرسال الطلب بنجاح":"إرسال طلب الدعم"}
              </button>
              <div className="text-xs text-center" style={{color:B.muted}}>
                سيتم إرسال الطلب إلى البريد التقني المسجّل في إعدادات النظام
                {" "}<span style={{fontFamily:"var(--font-app)",color:B.text2}}>{supportEmail}</span>
              </div>
            </div>
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
            {/* Recent requests */}
            <div className="rounded-2xl p-5" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <div className="font-extrabold text-sm mb-4" style={{color:B.black}}>الطلبات الأخيرة</div>
              <div className="flex flex-col gap-3">
                {reqs.map(r=>{
                  const sc=SUP_STATUS_COLORS[r.status];
                  const pm=PRIO_MAP[r.priority];
                  return (
                    <div key={r.id} className="rounded-xl p-3" style={{border:`1px solid ${B.border}`}}>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-mono text-xs font-bold" style={{color:B.muted}}>{r.id}</span>
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full" style={{background:sc.bg,color:sc.fg}}>{SUP_STATUS_LABELS[r.status]}</span>
                      </div>
                      <div className="font-bold text-sm mb-2" style={{color:B.black}}>{r.title}</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs" style={{color:B.muted}}>{r.category.split("—")[0].trim()}</span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded" style={{background:pm.bg,color:pm.fg}}>{r.priority}</span>
                        <span className="text-xs font-mono mr-auto" style={{color:B.muted}}>{r.date}</span>
                      </div>
                    </div>
                  );
                })}
                {reqs.length===0&&<p className="text-sm text-center py-4" style={{color:B.muted}}>لا توجد طلبات سابقة</p>}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
