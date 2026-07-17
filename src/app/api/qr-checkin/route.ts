import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

// POST /api/qr-checkin  body: { fileNumber }
export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const body = await req.json();
    const { fileNumber } = body;

    if (!fileNumber) {
      return NextResponse.json({ error: "رقم الملف مطلوب" }, { status: 400 });
    }

    const clubFilter = currentUser.role === "superadmin" ? {} : { clubId: currentUser.clubId! };
    const sub = await db.subscriber.findFirst({ where: { fileNumber, ...clubFilter } });
    if (!sub) {
      return NextResponse.json({ error: "رقم الملف غير موجود" }, { status: 404 });
    }

    // Check subscription validity
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let expiryDate: Date | null = null;
    if (sub.lastPaymentDate) {
      expiryDate = new Date(sub.lastPaymentDate);
      expiryDate.setDate(expiryDate.getDate() + 30);
    }

    let status: "ok" | "expired" | "no_payment" = "ok";
    if (sub.paymentStatus === "لم يدفع") status = "no_payment";
    else if (expiryDate && expiryDate < today) status = "expired";

    // Check if already checked in today
    const existing = await db.attendance.findUnique({
      where: { clubId_subscriberId_date: { clubId: sub.clubId, subscriberId: sub.id, date: today } },
    });

    if (existing) {
      return NextResponse.json({
        success: false,
        alreadyCheckedIn: true,
        subscriber: sub,
        attendance: existing,
      });
    }

    // If subscription is invalid, return warning but allow check-in (with note)
    const checkIn = new Date();
    const attendance = await db.attendance.create({
      data: {
        clubId: sub.clubId,
        subscriberId: sub.id,
        date: today,
        checkInTime: checkIn,
        method: "qr",
        note: status !== "ok" ? `حضور مع تحفظ: ${status === "expired" ? "اشتراك منتهي" : "لم يدفع"}` : null,
      },
      include: { subscriber: true },
    });

    await db.activity.create({
      data: {
        clubId: sub.clubId,
        subscriberId: sub.id,
        type: "attendance",
        description: `حضر ${sub.lastName} ${sub.firstName} عبر QR`,
      },
    });

    return NextResponse.json({
      success: true,
      subscriber: sub,
      attendance,
      status,
      expiryDate,
    }, { status: 201 });
  } catch (e) {
    console.error("QR checkin:", e);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }
}
