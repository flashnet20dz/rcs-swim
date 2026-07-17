"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CalendarOff,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  Users,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SWIMMING_DAYS, TIME_SLOTS } from "@/lib/rcs";

// ═══════════════════════════════════════════════════════════
// أنواع البيانات
// ═══════════════════════════════════════════════════════════
interface CompSubscriber {
  id: string;
  fileNumber: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}

interface Compensation {
  id: string;
  status: "pending" | "scheduled" | "used" | "expired" | "cancelled";
  originalDate: string;
  originalSwimmingDays: string | null;
  originalTimeSlot: string | null;
  compensationDate: string | null;
  compensationSwimmingDays: string | null;
  compensationTimeSlot: string | null;
  note: string | null;
  subscriber: CompSubscriber;
}

interface PoolClosure {
  id: string;
  date: string;
  swimmingDays: string | null;
  timeSlot: string | null;
  reason: string;
  note: string | null;
  compensations: Compensation[];
}

const STATUS_LABELS: Record<string, string> = {
  pending: "بانتظار التحديد",
  scheduled: "مُحدَّدة",
  used: "تم الاستخدام",
  expired: "منتهية",
  cancelled: "ملغاة",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  scheduled: "bg-sky-100 text-sky-700 border-sky-200",
  used: "bg-emerald-100 text-emerald-700 border-emerald-200",
  expired: "bg-gray-100 text-gray-500 border-gray-200",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200",
};

// ═══════════════════════════════════════════════════════════
// المكوّن الرئيسي
// ═══════════════════════════════════════════════════════════
export function CompensationsPanel() {
  const [closures, setClosures] = useState<PoolClosure[]>([]);
  const [loading, setLoading] = useState(true);
  const [newClosureOpen, setNewClosureOpen] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState<Compensation | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const loadClosures = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pool-closures");
      const data = await res.json();
      setClosures(data.closures || []);
    } catch {
      toast.error("تعذّر تحميل بيانات الإغلاقات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClosures();
  }, [loadClosures]);

  // كل التعويضات مسطّحة من كل الإغلاقات، مع فلترة الحالة
  const allCompensations = closures
    .flatMap((c) => c.compensations.map((comp) => ({ ...comp, closure: c })))
    .filter((c) => statusFilter === "all" || c.status === statusFilter)
    .sort((a, b) => new Date(b.originalDate).getTime() - new Date(a.originalDate).getTime());

  const pendingCount = closures.flatMap((c) => c.compensations).filter((c) => c.status === "pending").length;

  return (
    <div className="space-y-6" dir="rtl">
      {/* رأس القسم */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <CalendarOff className="h-5 w-5 text-primary" />
            إغلاق المسبح وتعويض المنخرطين
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            سجّل إغلاق المسبح للصيانة، وسيكتشف النظام تلقائياً المنخرطين المتأثرين وينشئ لهم تعويضات.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadClosures} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button size="sm" onClick={() => setNewClosureOpen(true)}>
            <Plus className="h-4 w-4 ml-1" />
            تسجيل إغلاق جديد
          </Button>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          يوجد <strong>{pendingCount}</strong> تعويض بانتظار تحديد حصة بديلة.
        </div>
      )}

      {/* فلتر الحالة */}
      <div className="flex items-center gap-2">
        <Label className="text-sm">الحالة:</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* قائمة التعويضات */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : allCompensations.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            لا توجد تعويضات حالياً
          </div>
        ) : (
          allCompensations.map((comp, i) => (
            <motion.div
              key={comp.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className="rounded-xl border bg-card p-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">
                    {comp.subscriber.firstName} {comp.subscriber.lastName}
                  </span>
                  <Badge variant="outline" className="text-xs">{comp.subscriber.fileNumber}</Badge>
                  <Badge className={cn("text-xs border", STATUS_COLORS[comp.status])}>
                    {STATUS_LABELS[comp.status]}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  الحصة الأصلية: {new Date(comp.originalDate).toLocaleDateString("ar")} —{" "}
                  {comp.originalSwimmingDays || "—"} / {comp.originalTimeSlot || "—"}
                  <span className="mx-1">·</span>
                  سبب الإغلاق: {comp.closure.reason}
                </p>
                {comp.compensationDate && (
                  <p className="text-xs text-emerald-700 flex items-center gap-1">
                    <CalendarCheck className="h-3 w-3" />
                    الحصة التعويضية: {new Date(comp.compensationDate).toLocaleDateString("ar")} —{" "}
                    {comp.compensationTimeSlot}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {comp.status === "pending" && (
                  <Button size="sm" onClick={() => setScheduleTarget(comp)}>
                    <Clock className="h-3.5 w-3.5 ml-1" />
                    تحديد حصة تعويضية
                  </Button>
                )}
                {comp.status === "scheduled" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      onClick={() => markUsed(comp.id, loadClosures)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 ml-1" />
                      تم الحضور
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setScheduleTarget(comp)}>
                      تغيير الموعد
                    </Button>
                  </>
                )}
                {(comp.status === "pending" || comp.status === "scheduled") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-rose-600 hover:bg-rose-50"
                    onClick={() => cancelCompensation(comp.id, loadClosures)}
                  >
                    <XCircle className="h-3.5 w-3.5 ml-1" />
                    إلغاء
                  </Button>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* نافذة تسجيل إغلاق جديد */}
      <NewClosureDialog
        open={newClosureOpen}
        onOpenChange={setNewClosureOpen}
        onCreated={loadClosures}
      />

      {/* نافذة تحديد الحصة التعويضية */}
      {scheduleTarget && (
        <ScheduleDialog
          compensation={scheduleTarget}
          onClose={() => setScheduleTarget(null)}
          onScheduled={() => {
            setScheduleTarget(null);
            loadClosures();
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// إجراءات مساعدة
// ═══════════════════════════════════════════════════════════
async function markUsed(id: string, refresh: () => void) {
  try {
    const res = await fetch(`/api/compensations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "use" }),
    });
    if (!res.ok) throw new Error();
    toast.success("تم تسجيل حضور الحصة التعويضية");
    refresh();
  } catch {
    toast.error("تعذّر تسجيل الحضور");
  }
}

async function cancelCompensation(id: string, refresh: () => void) {
  if (!confirm("هل تريد إلغاء هذا التعويض؟")) return;
  try {
    const res = await fetch(`/api/compensations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    if (!res.ok) throw new Error();
    toast.success("تم إلغاء التعويض");
    refresh();
  } catch {
    toast.error("تعذّر الإلغاء");
  }
}

// ═══════════════════════════════════════════════════════════
// نافذة: تسجيل إغلاق مسبح جديد
// ═══════════════════════════════════════════════════════════
function NewClosureDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [date, setDate] = useState("");
  const [swimmingDays, setSwimmingDays] = useState<string>("__all__");
  const [timeSlot, setTimeSlot] = useState<string>("__all__");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!date || !reason) {
      toast.error("التاريخ وسبب الإغلاق مطلوبان");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/pool-closures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          swimmingDays: swimmingDays === "__all__" ? null : swimmingDays,
          timeSlot: timeSlot === "__all__" ? null : timeSlot,
          reason,
          note: note || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`تم تسجيل الإغلاق — تأثر ${data.affectedCount} منخرط(ة) وأُنشئت لهم تعويضات`);
      onOpenChange(false);
      setDate(""); setSwimmingDays("__all__"); setTimeSlot("__all__"); setReason(""); setNote("");
      onCreated();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر تسجيل الإغلاق");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarOff className="h-4 w-4" />
            تسجيل إغلاق المسبح للصيانة
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>تاريخ الإغلاق *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>مجموعة الأيام المتأثرة</Label>
            <Select value={swimmingDays} onValueChange={setSwimmingDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">كل المجموعات (إغلاق شامل لليوم)</SelectItem>
                {SWIMMING_DAYS.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>التوقيت المتأثر</Label>
            <Select value={timeSlot} onValueChange={setTimeSlot}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">كل التوقيتات</SelectItem>
                {TIME_SLOTS.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>سبب الإغلاق *</Label>
            <Input
              placeholder="مثال: صيانة دورية لفلاتر المسبح"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>ملاحظة (اختياري)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>

          <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2 flex items-start gap-1.5">
            <Users className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            سيتم تلقائياً تحديد كل المنخرطين الذين حصتهم المعتادة تطابق الأيام/التوقيت المختار،
            وإنشاء تعويض لكل واحد منهم بحالة "بانتظار التحديد".
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
            تسجيل الإغلاق وإنشاء التعويضات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════
// نافذة: تحديد الحصة التعويضية
// ═══════════════════════════════════════════════════════════
function ScheduleDialog({
  compensation,
  onClose,
  onScheduled,
}: {
  compensation: Compensation;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const [date, setDate] = useState("");
  const [swimmingDays, setSwimmingDays] = useState<string>(
    compensation.originalSwimmingDays || SWIMMING_DAYS[0]
  );
  const [timeSlot, setTimeSlot] = useState<string>(compensation.originalTimeSlot || TIME_SLOTS[0]);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!date || !timeSlot) {
      toast.error("التاريخ والتوقيت مطلوبان");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/compensations/${compensation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "schedule",
          compensationDate: date,
          compensationSwimmingDays: swimmingDays,
          compensationTimeSlot: timeSlot,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "تعذّر التحديد");
        return;
      }
      toast.success("تم تحديد الحصة التعويضية وإشعار المنخرط");
      onScheduled();
    } catch {
      toast.error("تعذّر التحديد");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            تحديد حصة تعويضية — {compensation.subscriber.firstName} {compensation.subscriber.lastName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>تاريخ الحصة التعويضية *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>مجموعة الأيام</Label>
            <Select value={swimmingDays} onValueChange={setSwimmingDays}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SWIMMING_DAYS.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>التوقيت *</Label>
            <Select value={timeSlot} onValueChange={setTimeSlot}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIME_SLOTS.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            سيتحقق النظام تلقائياً من توفر مكان في هذه الحصة قبل التأكيد.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
            تأكيد الحصة التعويضية
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
