import type { Branch } from "@/types";

export const SEED_BRANCHES: Branch[] = [
  { id:"BR-001", name:"فرع الرياض — العليا", city:"الرياض", address:"طريق الملك فهد، حي العليا، الرياض",
    gmapUrl:"", phone:"+966 11 200 0001", managerId:"U-01", isActive:true },
  { id:"BR-002", name:"فرع جدة — الحمراء", city:"جدة", address:"شارع الأمير سلطان، حي الحمراء، جدة",
    gmapUrl:"", phone:"+966 12 200 0002", managerId:"U-02", isActive:true },
  { id:"BR-003", name:"فرع مكة — العزيزية", city:"مكة", address:"شارع العزيزية العام، مكة المكرمة",
    gmapUrl:"", phone:"+966 12 200 0003", managerId:"U-03", isActive:true },
  { id:"BR-004", name:"فرع تساهيل — الدمام", city:"الدمام", address:"حي الشاطئ، الدمام",
    gmapUrl:"", phone:"+966 13 200 0004", managerId:"", isActive:true },
  { id:"BR-005", name:"فرع تساهيل — الخبر", city:"الخبر", address:"طريق الكورنيش، الخبر",
    gmapUrl:"", phone:"+966 13 200 0005", managerId:"", isActive:true },
];
