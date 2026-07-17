/**
 * انتهاء تلقائي للتعويضات المتأخرة (Auto-Expire)
 * ──────────────────────────────────────────────
 * يشتغل "كسول" (lazy): يُستدعى في بداية كل قراءة (GET) لجداول
 * التعويضات/الإغلاقات، فيحدّث الحالات المتأخرة قبل إرجاع البيانات.
 * هذا يضمن عمله بدون الحاجة لأي Cron Job أو خادم يعمل باستمرار —
 * وهو أمر ضروري في وضع Desktop/Offline حيث لا يوجد نظام جدولة خارجي.
 *
 * حالتان تُعتبران "منتهية الصلاحية" (status = "expired"):
 * 1) pending  — تعويض لم تُحدَّد له حصة بديلة إطلاقاً، وتجاوز مدة
 *    السماح منذ إنشائه (افتراضياً 30 يوم، قابل للتخصيص من الإعدادات).
 * 2) scheduled — تعويض حُدِّدت له حصة بديلة، لكن موعدها مضى ولم
 *    يُسجَّل حضور المنخرط فيها (بعد مهلة سماح افتراضية يومين).
 *
 * التعويضات المستخدمة (used) أو الملغاة (cancelled) لا تُمس أبداً.
 */

import { db } from "./db";

const DEFAULT_PENDING_EXPIRY_DAYS = 30;
const DEFAULT_SCHEDULED_GRACE_DAYS = 2;

interface ExpireResult {
  expiredPending: number;
  expiredScheduled: number;
  total: number;
}

/**
 * يقرأ عدد أيام المهلة من جدول الإعدادات (Setting) إن وُجد، وإلا يستعمل
 * القيم الافتراضية. يسمح لمدير النادي بتخصيص المدة لاحقاً من واجهة الإعدادات
 * دون الحاجة لتعديل الكود.
 */
async function getExpirySettings(clubId?: string) {
  let pendingExpiryDays = DEFAULT_PENDING_EXPIRY_DAYS;
  let scheduledGraceDays = DEFAULT_SCHEDULED_GRACE_DAYS;

  try {
    const settings = await db.setting.findMany({
      where: {
        ...(clubId ? { clubId } : {}),
        key: { in: ["compensationPendingExpiryDays", "compensationScheduledGraceDays"] },
      },
    });
    for (const s of settings) {
      const n = parseInt(s.value, 10);
      if (Number.isFinite(n) && n > 0) {
        if (s.key === "compensationPendingExpiryDays") pendingExpiryDays = n;
        if (s.key === "compensationScheduledGraceDays") scheduledGraceDays = n;
      }
    }
  } catch {
    // إعدادات غير موجودة — استعمل الافتراضي بصمت
  }

  return { pendingExpiryDays, scheduledGraceDays };
}

/**
 * ينفّذ فحص وتحديث التعويضات المتأخرة.
 * clubId: مرّرها دائماً عندما يكون المستخدم مرتبطاً بنادٍ واحد.
 *         اتركها فارغة فقط للمدير العام (superadmin) لتحديث كل الأندية دفعة واحدة.
 */
export async function expireStaleCompensations(clubId?: string): Promise<ExpireResult> {
  const now = new Date();
  const clubFilter = clubId ? { clubId } : {};
  const { pendingExpiryDays, scheduledGraceDays } = await getExpirySettings(clubId);

  const pendingCutoff = new Date(now);
  pendingCutoff.setDate(pendingCutoff.getDate() - pendingExpiryDays);

  const scheduledCutoff = new Date(now);
  scheduledCutoff.setDate(scheduledCutoff.getDate() - scheduledGraceDays);

  // 1) معلّقة بدون أي جدولة، تجاوزت مهلة الانتظار
  const expiredPending = await db.compensation.updateMany({
    where: {
      ...clubFilter,
      status: "pending",
      createdAt: { lt: pendingCutoff },
    },
    data: { status: "expired" },
  });

  // 2) مُجدولة، فات موعدها + مهلة السماح، ولم تُستخدم
  const expiredScheduled = await db.compensation.updateMany({
    where: {
      ...clubFilter,
      status: "scheduled",
      compensationDate: { lt: scheduledCutoff },
    },
    data: { status: "expired" },
  });

  const total = expiredPending.count + expiredScheduled.count;

  // سجل نشاط فقط عندما نعرف النادي المحدد (تفادي الغموض في سجل عام لكل الأندية)
  if (total > 0 && clubId) {
    await db.activity.create({
      data: {
        clubId,
        type: "compensations_auto_expired",
        description: `تحديث تلقائي: ${total} تعويض(ات) أصبحت "منتهية" (${expiredPending.count} معلّقة تجاوزت ${pendingExpiryDays} يوم، ${expiredScheduled.count} محدَّدة فات موعدها)`,
      },
    });
  }

  return { expiredPending: expiredPending.count, expiredScheduled: expiredScheduled.count, total };
}
