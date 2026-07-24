import type { Hotel } from "@/types";

export const SEED_HOTELS: Hotel[] = [
  { id:"HTL-001", name:"دار الإيمان جراند", city:"مكة", stars:4, distanceM:500, district:"أجياد", phone:"+966 12 543 7777", mapUrl:"", status:"active", notes:"",
    features:[{id:"f1",icon:"wifi",text:"واي فاي مجاني"},{id:"f2",icon:"breakfast",text:"إفطار مجاني"},{id:"f3",icon:"pool",text:"مسبح"},{id:"f4",icon:"parking",text:"موقف سيارات"}],
    roomTypes:[{id:"r1",kind:"private",beds:1,pricePerNight:280},{id:"r2",kind:"shared",beds:3,pricePerNight:110}],
    tasaheelNote:"فندق ممتاز وقريب جداً من الحرم — يُنصح للعائلات.", reviews:[{id:"rv1",name:"خالد",text:"تجربة رائعة والخدمة ممتازة",consent:true}] },
  { id:"HTL-002", name:"أنوار المدينة موفنبيك", city:"المدينة", stars:4, distanceM:300, district:"المناخة", phone:"+966 14 820 9000", mapUrl:"", status:"active", notes:"",
    features:[{id:"f1",icon:"wifi",text:"واي فاي مجاني"},{id:"f2",icon:"restaurant",text:"مطعم فاخر"},{id:"f3",icon:"gym",text:"صالة رياضية"}],
    roomTypes:[{id:"r1",kind:"private",beds:1,pricePerNight:320},{id:"r2",kind:"private",beds:2,pricePerNight:480}],
    tasaheelNote:"مثالي للمجموعات القادمة للمدينة المنورة.", reviews:[] },
  { id:"HTL-003", name:"سويس أوتيل مكة", city:"مكة", stars:5, distanceM:250, district:"أبراج البيت", phone:"+966 12 679 1234", mapUrl:"", status:"active", notes:"",
    features:[{id:"f1",icon:"wifi",text:"واي فاي مجاني"},{id:"f2",icon:"breakfast",text:"إفطار فاخر"},{id:"f3",icon:"pool",text:"مسبح لا نهائي"},{id:"f4",icon:"gym",text:"مركز صحي"},{id:"f5",icon:"spa",text:"سبا ومساج"}],
    roomTypes:[{id:"r1",kind:"private",beds:1,pricePerNight:650},{id:"r2",kind:"private",beds:2,pricePerNight:950}],
    tasaheelNote:"إطلالة مباشرة على الكعبة — خيار VIP الأول.",
    reviews:[{id:"rv1",name:"سارة",text:"لا يوصف — إطلالة على الكعبة من الغرفة",consent:true},{id:"rv2",name:"محمد",text:"أفضل تجربة في حياتي",consent:true}] },
  { id:"HTL-004", name:"النخبة الاقتصادي", city:"مكة", stars:3, distanceM:900, district:"العزيزية", phone:"+966 12 370 5566", mapUrl:"", status:"inactive", notes:"متوقف مؤقتاً لأعمال الصيانة",
    features:[{id:"f1",icon:"wifi",text:"واي فاي مجاني"},{id:"f2",icon:"parking",text:"موقف سيارات"}],
    roomTypes:[{id:"r1",kind:"shared",beds:4,pricePerNight:75}],
    tasaheelNote:"اقتصادي مناسب للميزانيات المحدودة.", reviews:[] },
];
