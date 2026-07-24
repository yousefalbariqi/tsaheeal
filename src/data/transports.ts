import type { Transport } from "@/types";

export const SEED_TRANSPORTS: Transport[] = [
  { id:"TRN-001", name:"حافلة الحرمين 1", mode:"bus", vehicleType:"حافلة عادية", seats:49, seatCost:120,
    model:"مرسيدس توريزمو", year:"2023", plate:"أ ب ج 1234", driver:"خالد العتيبي", supervisor:"ماجد الزهراني",
    status:"active", notes:"",
    features:[{id:"f1",text:"مكيف هواء"},{id:"f2",text:"واي فاي مجاني"},{id:"f3",text:"مقاعد مريحة"},{id:"f4",text:"ثلاجة مشروبات"}], reviews:[] },
  { id:"TRN-002", name:"حافلة الحرمين 2", mode:"bus", vehicleType:"حافلة عادية", seats:49, seatCost:135,
    model:"مان لايونز كوتش", year:"2022", plate:"د هـ و 5678", driver:"سعد القرني", supervisor:"عبدالعزيز الحربي",
    status:"active", notes:"",
    features:[{id:"f1",text:"مكيف هواء"},{id:"f2",text:"شاشات ترفيه"},{id:"f3",text:"دورة مياه"},{id:"f4",text:"مقاعد مريحة"}], reviews:[] },
  { id:"TRN-003", name:"سبرينتر VIP", mode:"bus", vehicleType:"حافلة VIP", seats:30, seatCost:260,
    model:"مرسيدس سبرينتر", year:"2024", plate:"ز ح ط 9012", driver:"فهد الشمري", supervisor:"تركي المالكي",
    status:"active", notes:"",
    features:[{id:"f1",text:"مقاعد جلد فاخرة"},{id:"f2",text:"واي فاي عالي السرعة"},{id:"f3",text:"خدمة ضيافة"},{id:"f4",text:"إطلالة بانورامية"}],
    reviews:[{id:"rv1",name:"أحمد",text:"تجربة استثنائية — الراحة على أعلى مستوى",consent:true}] },
  { id:"TRN-004", name:"رحلة طيران المدينة", mode:"flight", vehicleType:"طيران داخلي", seats:120, seatCost:480,
    model:"طيران ناس", year:"2024", plate:"G9-521", driver:"الكابتن محمد الغامدي", supervisor:"كريم الشهري",
    status:"active", notes:"",
    features:[{id:"f1",text:"مقاعد مريحة"},{id:"f2",text:"وجبة خفيفة"},{id:"f3",text:"أمتعة 23 كجم"}],
    reviews:[] },
];
