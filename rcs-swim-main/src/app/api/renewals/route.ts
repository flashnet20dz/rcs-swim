import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const url = new URL(req.url);
    const subscriberId = url.searchParams.get("subscriberId");

    const clubFilter = currentUser.role === "superadmin" ? {} : { clubId: currentUser.clubId! };
    const where: Record<string, unknown> = { ...clubFilter };
    if (subscriberId) where.subscriberId = subscriberId;

    const renewals = await db.renewal.findMany({
      where,
      include: { subscriber: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ renewals });
  } catch (e) {
    console.error("GET renewals:", e);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const body = await req.json();
    const { subscriberId, months, amount, paymentStatus, note } = body;

    if (!subscriberId || !amount) {
      return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
    }

    const clubFilter = currentUser.role === "superadmin" ? {} : { clubId: currentUser.clubId! };
    const sub = await db.subscriber.findFirst({ where: { id: subscriberId, ...clubFilter } });
    if (!sub) return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });

    const renewalDate = new Date();
    const expiryDate = new Date(renewalDate);
    expiryDate.setDate(expiryDate.getDate() + (months || 1) * 30);

    const renewal = await db.renewal.create({
      data: {
        clubId: sub.clubId,
        subscriberId,
        renewalDate,
        expiryDate,
        months: months || 1,
        amount,
        paymentStatus: paymentStatus || "مدفوع",
        note: note || null,
      },
      include: { subscriber: true },
    });

    // Update subscriber's last payment & expiry
    await db.subscriber.update({
      where: { id: subscriberId },
      data: {
        lastPaymentDate: renewalDate,
        paymentStatus: paymentStatus || "مدفوع",
      },
    });

    await db.activity.create({
      data: {
        clubId: sub.clubId,
        subscriberId,
        type: "renewal",
        description: `تم تجديد اشتراك ${sub.lastName} ${sub.firstName} لمدة ${months || 1} شهر`,
      },
    });

    return NextResponse.json({ renewal }, { status: 201 });
  } catch (e) {
    console.error("POST renewals error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    );
  }
}
