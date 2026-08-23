#!/usr/bin/env bash
# فحص جاهزية قاعدة البيانات — قراءة فقط، بمفتاح anon من .env.
#   الاستعمال:  bash scripts/verify-db.sh
# يفحص أن الكتالوج مفتوح للمجهول، وأن الجداول الحسّاسة مغلقة عنه،
# وأن الدوال العامة موجودة ومحروسة. يُشغَّل قبل الإطلاق وبعد كل ترحيل.
set -uo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "لا يوجد .env"; exit 1; }
set -a; . ./.env >/dev/null 2>&1; set +a
U="$VITE_SUPABASE_URL"; K="$VITE_SUPABASE_ANON_KEY"
tmp=$(mktemp); trap 'rm -f "$tmp"' EXIT
fail=0

hit() { # hit <method> <endpoint> [body]
  if [ "${1}" = "POST" ]; then
    curl -s -o "$tmp" -w "%{http_code}" -X POST "$U/rest/v1/$2" \
      -H "apikey: $K" -H "Authorization: Bearer $K" \
      -H "Content-Type: application/json" -d "${3:-{\}}" --max-time 20
  else
    curl -s -o "$tmp" -w "%{http_code}" "$U/rest/v1/$2" \
      -H "apikey: $K" -H "Authorization: Bearer $K" --max-time 20
  fi
}

check() { # check <label> <expected-regex> <actual>
  if [[ "$3" =~ $2 ]]; then printf "  ✅ %-42s %s\n" "$1" "$3"
  else printf "  ❌ %-42s %s (المتوقّع %s)\n" "$1" "$3" "$2"; fail=1; fi
}

echo "── الكتالوج العام: يجب أن يقرأه المجهول (200) ──"
for t in packages trips hotels transports branches package_reviews hotel_room_types; do
  check "$t" '^(200|206)$' "$(hit GET "$t?select=id&limit=1")"
done

echo "── البيانات الحسّاسة: يجب أن تُرفض للمجهول (401) ──"
for t in bookings booking_pilgrims booking_seats payments tickets beneficiaries users support custom_requests customer_profiles profiles_should_not_exist; do
  [ "$t" = "profiles_should_not_exist" ] && continue
  check "$t" '^40[13]$' "$(hit GET "$t?select=*&limit=1")"
done

echo "── دوال المستفيد ──"
check "trip_taken_seats موجودة"      '^200$' "$(hit POST rpc/trip_taken_seats '{"p_trip_id":"__none__"}')"
check "create_custom_request تعمل"   '^400$' "$(hit POST rpc/create_custom_request '{"doc":{}}')"
check "create_public_booking محروسة" '^40[13]$' "$(hit POST rpc/create_public_booking '{"doc":{}}')"
check "my_public_bookings محروسة"    '^40[13]$' "$(hit POST rpc/my_public_bookings '{}')"

echo "── دوال الإدارة: يجب أن ترفض المجهول ──"
for f in upsert_hotel upsert_package upsert_trip upsert_booking upsert_payment upsert_ticket upsert_user upsert_beneficiary upsert_branch upsert_transport upsert_support upsert_custom_request; do
  check "$f" '^40[13]$' "$(hit POST "rpc/$f" '{"doc":{}}')"
done

echo "── رايات البيئة ──"
if grep -q '^VITE_CUSTOMER_AUTH_MODE=dev' .env 2>/dev/null; then
  echo "  ❌ VITE_CUSTOMER_AUTH_MODE=dev — حجوزات العملاء لا تصل القاعدة"; fail=1
else echo "  ✅ الوضع التجريبي للهوية مطفأ"; fi
if grep -q '^VITE_SKIP_SEAT_CHECK=1' .env 2>/dev/null; then
  echo "  ❌ VITE_SKIP_SEAT_CHECK=1 — المقاعد المعروضة وهمية"; fail=1
else echo "  ✅ فحص المقاعد مفعَّل في الواجهة"; fi

echo
[ $fail -eq 0 ] && echo "النتيجة: جاهز ✅" || echo "النتيجة: توجد إخفاقات ❌"
exit $fail
