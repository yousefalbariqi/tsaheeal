# تنبيه بريد الموظفين

هذه الدالة ترسل رسالةً إلى فريق العمل عند إدراج حجز أو طلب مخصص جديد.
يمكن أن يحتوي NOTIFICATION_REPLY_TO على عنوان واحد أو عدة عناوين مفصولة
بفاصلة.

## النشر

1. طبّق ترحيل 20261011_staff_email_notifications.sql.
2. أضف الأسرار من ملف .env.example إلى Supabase:

    supabase secrets set --env-file supabase/functions/notify-staff-new-request/.env
    supabase functions deploy notify-staff-new-request

3. من Supabase Dashboard > Database > Webhooks أنشئ Webhook:
   - الجدول: staff_email_notifications
   - الأحداث: INSERT و UPDATE
   - الوجهة: Edge Function notify-staff-new-request
   - المصادقة: Add auth header with service key

الدالة تتجاهل أي حدث ليست حالته queued، لذلك لا تعيد إرسال البريد عندما
تحدّث الحالة إلى sending أو sent.

## إعادة المحاولة

تظهر الرسائل الفاشلة في staff_email_notifications مع last_error.
بعد تصحيح الإعدادات، ينفذ الموظف:

    select public.requeue_staff_email_notification('<notification uuid>');

سيعيد Webhook استدعاء الدالة للإرسال. لا يُعاد إنشاء حجز أو طلب جديد.
