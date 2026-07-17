import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeSubscriberFields } from "@/lib/rcs";
import { getCurrentUser } from "@/lib/session";

// This endpoint can be called by a cron job (e.g., Vercel Cron) to generate notifications
// GET /api/cron/notifications — generates renewal + absence reminders
export async function GET() {
  try {
    const currentUser = await getCurrentUser();

    // Determine club filter: cron calls (no user) and superadmin process all clubs;
    // regular users only process their own club.
    const clubFilter = !currentUser || currentUser.role === "superadmin"
      ? {}
      : { clubId: currentUser.clubId! };

    const subscribers = await db.subscriber.findMany({
      where: clubFilter,
      include: {
        attendances: {
          orderBy: { date: "desc" },
          take: 1,
        },
      },
    });
    const computed = subscribers.map((s) => ({ ...s, ...computeSubscriberFields(s) }));

    const expiringSoon = computed.filter((s) => s.renewalStatus === "⚠️ قريب الانتهاء");
    const expired = computed.filter((s) => s.renewalStatus === "⛔ منتهي - يتطلب تجديد");

    let created = 0;

    // Group admins per club so each subscriber's notifications go to its own club's admins
    const adminsByClub = new Map<string, { id: string }[]>();
    async function getAdminsForClub(clubId: string) {
      let list = adminsByClub.get(clubId);
      if (!list) {
        list = await db.user.findMany({
          where: { clubId, role: "admin", active: true },
          select: { id: true },
        });
        adminsByClub.set(clubId, list);
      }
      return list;
    }

    for (const sub of expiringSoon) {
      const existing = await db.notification.findFirst({
        where: {
          clubId: sub.clubId,
          type: "renewal",
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          message: { contains: sub.fileNumber },
        },
      });
      if (!existing) {
        const admins = await getAdminsForClub(sub.clubId);
        for (const admin of admins) {
          await db.notification.create({
            data: {
              clubId: sub.clubId,
              userId: admin.id,
              type: "renewal",
              title: "اشتراك قريب الانتهاء",
              message: `${sub.lastName} ${sub.firstName} (${sub.fileNumber}) — ينتهي في ${sub.expiryDate ? new Date(sub.expiryDate).toLocaleDateString("ar-DZ") : "قريب"}`,
              link: "/?tab=renewals",
            },
          });
          created++;
        }
      }
    }

    for (const sub of expired) {
      const existing = await db.notification.findFirst({
        where: {
          clubId: sub.clubId,
          type: "renewal",
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          message: { contains: sub.fileNumber },
        },
      });
      if (!existing) {
        const admins = await getAdminsForClub(sub.clubId);
        for (const admin of admins) {
          await db.notification.create({
            data: {
              clubId: sub.clubId,
              userId: admin.id,
              type: "renewal",
              title: "⚠️ اشتراك منتهي",
              message: `${sub.lastName} ${sub.firstName} (${sub.fileNumber}) — اشتراك منتهي ويحتاج تجديد`,
              link: "/?tab=renewals",
            },
          });
          created++;
        }
      }
    }

    // Absence alerts: subscribers who haven't attended in 3 weeks
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const threeWeeksAgo = new Date(now);
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);

    let absenceCreated = 0;
    for (const sub of subscribers) {
      const lastAtt = sub.attendances[0]?.date;
      const lastDate = lastAtt ? new Date(lastAtt) : null;
      if (lastDate && lastDate >= threeWeeksAgo) continue; // attended recently
      if (!sub.lastPaymentDate) continue; // never paid, skip

      const existing = await db.notification.findFirst({
        where: {
          clubId: sub.clubId,
          type: "system",
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // weekly dedup
          message: { contains: sub.fileNumber },
          title: { contains: "غياب" },
        },
      });
      if (!existing) {
        const weeks = lastDate
          ? Math.floor((now.getTime() - lastDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
          : 99;
        const admins = await getAdminsForClub(sub.clubId);
        for (const admin of admins) {
          await db.notification.create({
            data: {
              clubId: sub.clubId,
              userId: admin.id,
              type: "system",
              title: "🚨 غياب متكرر",
              message: `${sub.lastName} ${sub.firstName} (${sub.fileNumber}) — غائب ${weeks >= 99 ? "منذ البداية" : `${weeks} أسابيع`} — ينبغي التواصل معه`,
              link: "/?tab=subscribers",
            },
          });
          absenceCreated++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      created,
      absenceCreated,
      expiringSoon: expiringSoon.length,
      expired: expired.length,
    });
  } catch (e) {
    console.error("Cron notifications:", e);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }
}
