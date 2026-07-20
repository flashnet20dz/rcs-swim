import { NextRequest, NextResponse } from "next/server";
import {
  verifyCredentials,
  createSession,
  setSessionCookie,
  ensureDefaultAdmin,
  ensureDefaultSettings,
  cleanupExpiredSessions,
} from "@/lib/session";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "البريد وكلمة المرور مطلوبان" }, { status: 400 });
    }

    // Self-healing: try to ensure admin + settings exist. If tables don't exist yet
    // (fresh database), trigger /api/setup first via a fetch.
    try {
      await ensureDefaultAdmin();
      await ensureDefaultSettings();
    } catch (e) {
      console.error("ensureDefaultAdmin failed, running setup:", e);
      // Trigger setup
      try {
        const setupRes = await fetch(`${req.nextUrl.origin}/api/setup`, { cache: "no-store" });
        if (setupRes.ok) {
          await ensureDefaultAdmin();
          await ensureDefaultSettings();
        }
      } catch (setupErr) {
        console.error("Setup auto-trigger failed:", setupErr);
      }
    }

    // Cleanup expired sessions (best effort)
    cleanupExpiredSessions().catch(() => {});

    const userCheck = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (userCheck?.pending) {
      return NextResponse.json({
        error: "حسابك بانتظار موافقة المدير. يرجى المحاولة لاحقاً.",
      }, { status: 403 });
    }
    if (userCheck && !userCheck.active) {
      return NextResponse.json({
        error: "حسابك معطّل. تواصل مع المدير.",
      }, { status: 403 });
    }

    const user = await verifyCredentials(email, password);
    if (!user) {
      return NextResponse.json({ error: "بيانات الدخول غير صحيحة" }, { status: 401 });
    }

    const token = await createSession(user);
    await setSessionCookie(token);

    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (e) {
    console.error("Login error:", e);
    const errMsg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return NextResponse.json({ error: "خطأ داخلي في الخادم", debug: errMsg }, { status: 500 });
  }
}
