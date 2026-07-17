import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { createSession, setSessionCookie, getCurrentUser } from "@/lib/session";

/**
 * POST /api/cashier-pin
 * Body: { pin: "1234" }
 * Authenticates via 4-digit PIN and creates a session.
 * Used for fast tablet cashier login.
 *
 * GET /api/cashier-pin
 * Returns list of PINs (admin only) — never returns the hash.
 *
 * POST /api/cashier-pin (with action=create)
 * Body: { action: "create", pin, label, role }
 * Creates a new PIN (admin only).
 *
 * DELETE /api/cashier-pin/[id]
 * Deletes a PIN (admin only).
 */
export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin")) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
    }
    const clubFilter = currentUser.role === "superadmin" ? {} : { clubId: currentUser.clubId! };
    const pins = await db.cashierPin.findMany({
      where: clubFilter,
      select: { id: true, label: true, role: true, active: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ pins });
  } catch (e) {
    console.error("GET cashier-pin:", e);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pin, action, label, role } = body;

    if (!pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: "PIN يجب أن يكون 4 أرقام" }, { status: 400 });
    }

    // Action: create new PIN (admin only)
    if (action === "create") {
      const currentUser = await getCurrentUser();
      if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "superadmin")) {
        return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
      }
      const pinHash = await bcrypt.hash(pin, 10);
      const newPin = await db.cashierPin.create({
        data: {
          clubId: currentUser.clubId!,
          pin: pinHash,
          label: label || "كاشير",
          role: role || "assistant",
          active: true,
        },
        select: { id: true, label: true, role: true, active: true, createdAt: true },
      });
      // IMPORTANT: do NOT log the admin out. The admin stays logged in as admin.
      // The PIN login flow is a separate path on /pin page (action: "login", default).
      return NextResponse.json({ pin: newPin });
    }

    // Action: login with PIN
    // PIN is globally unique, so we check all active PINs (no user context yet)
    const pins = await db.cashierPin.findMany({ where: { active: true } });
    if (pins.length === 0) {
      return NextResponse.json({ error: "لا توجد أكواد PIN مفعّلة. سجّل الدخول كمدير لإنشاء واحد." }, { status: 404 });
    }

    type PinRow = { id: string; pin: string; label: string; role: string; clubId: string };
    let matchedPin: PinRow | null = null;
    for (const p of pins) {
      const ok = await bcrypt.compare(pin, p.pin);
      if (ok) { matchedPin = p as PinRow; break; }
    }

    if (!matchedPin) {
      return NextResponse.json({ error: "PIN غير صحيح" }, { status: 401 });
    }

    const fakeUser = {
      id: `pin-${matchedPin.id}`,
      email: `cashier@pin.local`,
      name: matchedPin.label,
      role: matchedPin.role,
      phone: null,
      clubId: matchedPin.clubId,
    };

    const token = await createSession(fakeUser);
    await setSessionCookie(token);

    return NextResponse.json({ user: fakeUser });
  } catch (e) {
    console.error("POST cashier-pin:", e);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }
}
