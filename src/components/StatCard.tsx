import { B } from "@/lib/theme";

export function StatCard({label,value,sub,accent=false}:{label:string;value:string|number;sub?:string;accent?:boolean}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl px-5 py-4"
      style={{
        background:accent?`linear-gradient(135deg,${B.primary} 0%,${B.primaryDeep} 100%)`:"#fff",
        border:accent?"1px solid rgba(192,134,44,0.3)":`1px solid ${B.border}`,
        boxShadow:accent?"0 8px 24px -8px rgba(192,134,44,0.25)":"0 1px 4px rgba(21,76,72,0.06)",
      }}>
      <div className="text-xs font-semibold" style={{color:B.muted}}>{label}</div>
      <div className="text-3xl font-extrabold" style={{color:accent?B.gold:B.black,fontFamily:"var(--font-app)",lineHeight:1}}>{value}</div>
      {sub && <div className="text-xs" style={{color:accent?"#9DBAB6":B.muted}}>{sub}</div>}
    </div>
  );
}
