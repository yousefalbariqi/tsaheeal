import type { SystemUser } from "@/types";

export const SEED_USERS: SystemUser[] = [
  { id:"U-01", name:"سالم أحمد",  email:"salem@tasahheel.com",  role:"مدير النظام", status:"active",   lastLogin:"2025-07-05 10:30" },
  { id:"U-02", name:"عادل محمد",  email:"adel@tasahheel.com",   role:"موظف",        status:"active",   lastLogin:"2025-07-05 09:15" },
  { id:"U-03", name:"يوسف علي",   email:"yousef@tasahheel.com", role:"مدير عام",    status:"active",   lastLogin:"2025-07-04 16:20" },
  { id:"U-04", name:"فهد الخالد", email:"fahad@tasahheel.com",  role:"موظف",        status:"inactive", lastLogin:"2025-07-03 11:45" },
];
