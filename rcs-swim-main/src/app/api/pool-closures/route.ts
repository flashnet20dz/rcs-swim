import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/**
 * GET /api/pool-closures
 * يرجع كل عمليات إغلاق المسبح (الأحدث أولاً) مع عدد المتأثرين لكل واحدة.
 */
export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const clubFilter = currentUser.role === "superadmin" ? {} : { clubId: currentUser.clubId! };

    const closures = await db.poolClosure.findMany({
      where: clubFilter,
      include: {
        compensations: {
          include: { subscriber: true },
        },
      },
      orderBy: { date: "desc" },
    });

    return NextResponse.json({ closures });
  } catch (e) {
    console.error("GET pool-closures:", e);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }
}

/**
 * POST /api/pool-closures
 * ينشئ إغلاقاً للمسبح، ويكتشف تلقائياً كل المنخرطين الذين حصتهم المعتادة
 * تتوافق مع تاريخ/مجموعة أيام/توقيت الإغلاق، وينشئ لهم سجلات تعويض (status = pending).
 *
 * body: { date, swimmingDays?, timeSlot?, reason, note? }
 * - swimmingDays / timeSlot فارغين = يشمل الإغلاق كل المنخرطين (إغلاق كامل لليوم)
 */
export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const body = await req.json();
    const { date, swimmingDays, timeSlot, reason, note } = body;

    if (!date || !reason) {
      return NextResponse.json({ error: "التاريخ وسبب الإغلاق مطلوبان" }, { status: 400 });
    }

    const clubId = currentUser.role === "superadmin" ? body.clubId : currentUser.clubId!;
    if (!clubId) {
      return NextResponse.json({ error: "النادي غير محدد" }, { status: 400 });
    }

    const closureDate = new Date(date);

    // 1) أنشئ سجل الإغلاق
    const closure = await db.poolClosure.create({
      data: {
        clubId,
        date: closureDate,
        swimmingDays: swimmingDays || null,
        timeSlot: timeSlot || null,
        reason,
        note: note || null,
        createdById: currentUser.id,
      },
    });

    // 2) اكتشف المنخرطين المتأثرين: نفس مجموعة الأيام + نفس التوقيت
    //    (إذا لم تُحدَّد قيمة، اعتبرها "تطابق كل شيء" — إغلاق شامل)
    const where: Record<string, unknown> = { clubId };
    if (swimmingDays) where.swimmingDays = swimmingDays;
    if (timeSlot) where.timeSlot = timeSlot;

    const affectedSubscribers = await db.subscriber.findMany({ where });

    // 3) أنشئ سجل تعويض pending لكل منخرط متأثر
    if (affectedSubscribers.length > 0) {
      await db.compensation.createMany({
        data: affectedSubscribers.map((s) => ({
          clubId,
          closureId: closure.id,
          subscriberId: s.id,
          originalDate: closureDate,
          originalSwimmingDays: s.swimmingDays,
          originalTimeSlot: s.timeSlot,
          status: "pending",
        })),
      });

      // 4) إشعار لكل منخرط متأثر (يظهر في جرس الإشعارات + يمكن ربطه لاحقاً بواتساب)
      await db.notification.createMany({
        data: affectedSubscribers.map((s) => ({
          clubId,
          type: "pool_closure",
          title: "إغلاق المسبح للصيانة",
          message: `تم إغلاق حصة "${s.swimmingDays ?? ""} — ${s.timeSlot ?? ""}" بتاريخ ${closureDate.toLocaleDateString("ar")} بسبب: ${reason}. سيتم تعويض المنخرط ${s.firstName} ${s.lastName} بحصة بديلة.`,
          link: `/dashboard/compensations?subscriberId=${s.id}`,
        })),
      });

      await db.activity.create({
        data: {
          clubId,
          type: "pool_closure",
          description: `إغلاق مسبح للصيانة بتاريخ ${closureDate.toLocaleDateString("ar")} — تأثر ${affectedSubscribers.length} منخرط(ة)`,
          userId: currentUser.id,
          metadata: JSON.stringify({ closureId: closure.id, reason, count: affectedSubscribers.length }),
        },
      });
    }

    return NextResponse.json({
      closure,
      affectedCount: affectedSubscribers.length,
    });
  } catch (e) {
    console.error("POST pool-closures:", e);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }
}
