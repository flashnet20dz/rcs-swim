import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeSubscriberFields } from "@/lib/rcs";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const clubFilter = currentUser.role === "superadmin" ? {} : { clubId: currentUser.clubId! };
    const subscribers = await db.subscriber.findMany({
      where: clubFilter,
      orderBy: { createdAt: "asc" },
    });

    const computed = subscribers.map((s) => ({
      ...s,
      ...computeSubscriberFields(s),
    }));

    const paid = computed.filter((s) => s.paymentStatus !== "لم يدفع");

    // Financial stats
    const totalSubscriptionFees = paid.reduce((sum, s) => sum + (s.subscriptionFee ?? 0), 0);
    const totalInsuranceFees = paid.reduce((sum, s) => sum + (s.insuranceFee ?? 0), 0);
    const totalCompoundRights = paid.reduce((sum, s) => sum + (s.compoundRights ?? 0), 0);
    const totalRevenue = totalSubscriptionFees + totalInsuranceFees;
    const avgPayment = paid.length > 0 ? Math.round(totalRevenue / paid.length) : 0;

    // Subscription type breakdown — ديناميكي من قاعدة البيانات
    const subTypeWhere = currentUser.role === "superadmin"
      ? { active: true }
      : { clubId: currentUser.clubId!, active: true };
    const dbSubTypes = await db.subscriptionType.findMany({
      where: subTypeWhere,
      select: { code: true, name: true },
      orderBy: { sortOrder: "asc" },
    });
    const bySubscriptionType = dbSubTypes.map((t) => ({
      type: t.name === t.code ? t.name : `${t.name} (${t.code})`,
      count: computed.filter((s) => s.subscriptionType === t.code).length,
    }));

    // Payment status breakdown
    const paymentStatuses = ["مدفوع", "لم يدفع", "تأمين فقط", "اشتراك 300"] as const;
    const byPaymentStatus = paymentStatuses.map((status) => ({
      status,
      count: computed.filter((s) => s.paymentStatus === status).length,
    }));

    // Renewal status breakdown
    const renewalStatuses = ["✅ ساري", "⚠️ قريب الانتهاء", "⛔ منتهي - يتطلب تجديد", "🔒 مجمدة"] as const;
    const renewalLabels = ["سارية", "قريبة الانتهاء", "منتهية", "مجمدة"];
    const byRenewalStatus = renewalStatuses.map((status, i) => ({
      status: renewalLabels[i],
      count: computed.filter((s) => s.renewalStatus === status).length,
    }));

    // Age/gender breakdown — strict 13 cutoff (4 official categories)
    const malesUnder13 = computed.filter((s) => s.gender === "ذكر" && s.age < 13).length;
    const femalesUnder13 = computed.filter((s) => s.gender === "أنثى" && s.age < 13).length;
    const malesOver13 = computed.filter((s) => s.gender === "ذكر" && s.age >= 13).length;
    const femalesOver13 = computed.filter((s) => s.gender === "أنثى" && s.age >= 13).length;
    const totalMales = computed.filter((s) => s.gender === "ذكر").length;
    const totalFemales = computed.filter((s) => s.gender === "أنثى").length;
    // Aliases kept for backward-compatibility with the dashboard widget — now strictly 13-based.
    const adultsOver14 = malesOver13 + femalesOver13;
    const childrenUnder14 = malesUnder13 + femalesUnder13;

    // Blood type breakdown
    const bloodTypes = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] as const;
    const byBloodType = bloodTypes.map((type) => ({
      type,
      count: computed.filter((s) => s.bloodType === type).length,
    }));

    // Swimming days breakdown
    const swimmingDaysOptions = ["الأحد والأربعاء", "الاثنين والخميس", "الثلاثاء والجمعة", "كل الأيام"] as const;
    const bySwimmingDays = swimmingDaysOptions.map((days) => ({
      days,
      count: computed.filter((s) => s.swimmingDays === days).length,
    }));

    // Time slots breakdown
    const timeSlots = ["09:00-10:00", "10:00-11:00", "19:00-20:00", "20:00-21:00"] as const;
    const byTimeSlot = timeSlots.map((slot) => ({
      slot,
      count: computed.filter((s) => s.timeSlot === slot).length,
    }));

    // Financial detail
    const financialDetail = {
      count300: computed.filter((s) => s.subscriptionFee === 300).length,
      sum300: computed.filter((s) => s.subscriptionFee === 300).reduce((sum, s) => sum + 300, 0),
      count1300: computed.filter((s) => s.subscriptionFee === 1300).length,
      sum1300: computed.filter((s) => s.subscriptionFee === 1300).reduce((sum, s) => sum + 1300, 0),
      count1500: computed.filter((s) => s.subscriptionFee === 1500).length,
      sum1500: computed.filter((s) => s.subscriptionFee === 1500).reduce((sum, s) => sum + 1500, 0),
      totalInsurance: totalInsuranceFees,
      totalCompoundRights,
    };

    return NextResponse.json({
      total: subscribers.length,
      paid: paid.length,
      financial: {
        totalSubscriptionFees,
        totalInsuranceFees,
        totalCompoundRights,
        totalRevenue,
        avgPayment,
      },
      bySubscriptionType,
      byPaymentStatus,
      byRenewalStatus,
      ageGender: {
        malesUnder13,
        femalesUnder13,
        malesOver13,
        femalesOver13,
        totalMales,
        totalFemales,
        adultsOver14,
        childrenUnder14,
      },
      byBloodType,
      bySwimmingDays,
      byTimeSlot,
      financialDetail,
    });
  } catch (error) {
    console.error("GET /api/stats error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
