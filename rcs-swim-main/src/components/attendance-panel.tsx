"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, CheckCircle2, Clock, QrCode, Search, Trash2, Users, Loader2,
  TrendingUp, X, Flame, Filter, Activity, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { QRScanner } from "@/components/qr-scanner";
import { notifySuccess, notifyWarning, notifyClick, notifyError } from "@/lib/sounds";
import type { SubscriberWithComputed } from "@/lib/rcs";

interface Attendance {
  id: string;
  date: string;
  checkInTime: string;
  checkOutTime: string | null;
  method: string;
  note: string | null;
  subscriber: {
    id: string;
    fileNumber: string;
    lastName: string;
    firstName: string;
    gender: string;
  };
}

interface LiveData {
  todayCount: number;
  currentlyInPool: number;
  byGroup: Record<string, { total: number; inPool: number }>;
  currentlyInPoolList: Array<{
    id: string;
    checkInTime: string;
    subscriber: { id: string; fileNumber: string; lastName: string; firstName: string; timeSlot: string | null };
  }>;
}

interface HeatmapData {
  matrix: number[][];
  dayNames: string[];
  max: number;
  bySlot: Record<string, number>;
  total: number;
}

interface AttendancePanelProps {
  subscribers: SubscriberWithComputed[];
  onRefresh?: () => void;
}

export function AttendancePanel({ subscribers, onRefresh }: AttendancePanelProps) {
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [live, setLive] = useState<LiveData | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [manualSubId, setManualSubId] = useState("");
  const [filterGroup, setFilterGroup] = useState("all");
  const [showHeatmap, setShowHeatmap] = useState(false);

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance?date=${selectedDate}`);
      const data = await res.json();
      setAttendances(data.attendances || []);
    } catch {
      toast.error("تعذر تحميل سجل الحضور");
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance/live");
      const data = await res.json();
      setLive(data);
    } catch { /* ignore */ }
  }, []);

  const fetchHeatmap = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance/live?mode=heatmap&days=90");
      const data = await res.json();
      setHeatmap(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);
  useEffect(() => {
    fetchLive();
    const t = setInterval(fetchLive, 30000); // refresh every 30s
    return () => clearInterval(t);
  }, [fetchLive]);
  useEffect(() => {
    if (showHeatmap && !heatmap) fetchHeatmap();
  }, [showHeatmap, heatmap, fetchHeatmap]);

  const handleManualCheckIn = async (subscriberId: string) => {
    if (!subscriberId) return;
    try {
      const { offlineFetch } = await import("@/hooks/use-offline-mutation");
      const res = await offlineFetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriberId, method: "manual" }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error?.includes("تم تسجيل")) {
          notifyWarning();
          toast.warning("تم تسجيل الحضور مسبقاً لهذا المنخرط اليوم");
        } else {
          notifyError();
          toast.error(data.error || "فشل");
        }
      } else if (data.offline) {
        notifySuccess();
        toast.success("✓ تم تسجيل الحضور محلياً — سيُزامن عند عودة الاتصال");
      } else {
        // Play sound based on status
        if (data.status === "expired" || data.status === "frozen") {
          notifyWarning();
          toast.warning(`⚠️ ${data.renewalStatus} — ${data.attendance.subscriber.lastName} ${data.attendance.subscriber.firstName}`);
        } else {
          notifySuccess();
          toast.success(`✓ تم تسجيل حضور ${data.attendance.subscriber.lastName} ${data.attendance.subscriber.firstName}`);
        }
        fetchAttendance();
        fetchLive();
        onRefresh?.();
      }
      setManualSubId("");
    } catch {
      notifyError();
      toast.error("خطأ في الاتصال");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/attendance?id=${id}`, { method: "DELETE" });
      notifyClick();
      toast.success("تم حذف سجل الحضور");
      fetchAttendance();
      fetchLive();
    } catch {
      toast.error("فشل الحذف");
    }
  };

  const filtered = subscribers.filter((s) => {
    if (!search) return filterGroup === "all" ? true : (s.timeSlot === filterGroup);
    const q = search.toLowerCase();
    const matches = s.lastName.toLowerCase().includes(q) ||
      s.firstName.toLowerCase().includes(q) ||
      s.fileNumber.toLowerCase().includes(q) ||
      (s.phone || "").includes(q);
    return matches && (filterGroup === "all" || s.timeSlot === filterGroup);
  });

  // Stats for today
  const todayCount = attendances.length;
  const qrCount = attendances.filter((a) => a.method === "qr").length;
  const manualCount = attendances.filter((a) => a.method === "manual").length;
  const presentIds = new Set(attendances.map((a) => a.subscriber.id));
  const absentCount = subscribers.length - todayCount;

  const groups = Array.from(new Set(subscribers.map((s) => s.timeSlot).filter(Boolean))) as string[];

  return (
    <div className="space-y-4">
      {/* Live counter banner */}
      {live && live.currentlyInPool > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-emerald-500/40 bg-gradient-to-l from-emerald-500/15 to-transparent p-4 flex items-center gap-4"
        >
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
              <Flame className="h-6 w-6" />
            </div>
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
            </span>
          </div>
          <div className="flex-1">
            <p className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300">
              في المسبح الآن: {live.currentlyInPool} شخص
            </p>
            <p className="text-xs text-muted-foreground">
              من أصل {live.todayCount} مسجَّل اليوم
              {Object.entries(live.byGroup).filter(([_, v]) => v.inPool > 0).map(([slot, v]) =>
                ` • فوج ${slot}: ${v.inPool}`
              ).join("")}
            </p>
          </div>
        </motion.div>
      )}

      {/* Top bar */}
      <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <h2 className="font-bold text-base">سجل الحضور اليومي</h2>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowHeatmap(!showHeatmap)} size="sm">
              <TrendingUp className="h-4 w-4 ml-1" /> {showHeatmap ? "إخفاء الخريطة" : "خريطة الازدحام"}
            </Button>
            <Button onClick={() => setScannerOpen(true)} className="h-10">
              <QrCode className="h-4 w-4 ml-1" /> مسح QR
            </Button>
          </div>
        </div>

        {/* Date + group filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-10 w-44"
          />
          <Badge variant="outline" className="h-7">
            {new Date(selectedDate).toLocaleDateString("ar-DZ", { weekday: "long", day: "numeric", month: "long" })}
          </Badge>
          <Select value={filterGroup} onValueChange={setFilterGroup}>
            <SelectTrigger className="h-10 w-44">
              <Filter className="h-3.5 w-3.5 ml-1" />
              <SelectValue placeholder="كل الأفواج" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأفواج</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatPill icon={Users} label="حاضرون" value={todayCount} color="emerald" />
          <StatPill icon={QrCode} label="عبر QR" value={qrCount} color="violet" />
          <StatPill icon={CheckCircle2} label="يدوي" value={manualCount} color="amber" />
          <StatPill icon={X} label="غائبون" value={absentCount} color="rose" />
        </div>
      </div>

      {/* Heatmap */}
      {showHeatmap && heatmap && (
        <HeatmapView data={heatmap} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Manual check-in */}
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" /> تسجيل حضور يدوي
            {filterGroup !== "all" && (
              <Badge variant="secondary" className="text-[10px]">فوج: {filterGroup}</Badge>
            )}
          </h3>
          <div className="relative mb-3">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ابحث بالاسم أو رقم الملف أو الهاتف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-10 h-10"
            />
          </div>
          <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1 -mr-1">
            {filtered.slice(0, 30).map((s) => {
              const isPresent = presentIds.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => !isPresent && handleManualCheckIn(s.id)}
                  disabled={isPresent}
                  className={cn(
                    "w-full flex items-center gap-2 p-2 rounded-lg border text-right transition",
                    isPresent
                      ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 opacity-70 cursor-not-allowed"
                      : "hover:bg-accent hover:border-primary/40 border-border"
                  )}
                >
                  <Avatar className="h-8 w-8 rounded-lg shrink-0">
                    <AvatarFallback className={cn(
                      "rounded-md text-xs font-bold",
                      s.gender === "ذكر" ? "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300"
                      : "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300"
                    )}>
                      {s.lastName[0]}{s.firstName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{s.lastName} {s.firstName}</p>
                    <p className="text-xs text-muted-foreground font-mono">{s.fileNumber} {s.timeSlot && `• ${s.timeSlot}`}</p>
                  </div>
                  {isPresent ? (
                    <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
                      <CheckCircle2 className="h-3 w-3 ml-1" /> حاضر
                    </Badge>
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">لا توجد نتائج</p>
            )}
          </div>
        </div>

        {/* Today's list */}
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> حاضرو اليوم ({attendances.length})
          </h3>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : attendances.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
              لا يوجد حضور مسجل لهذا اليوم
            </div>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1 -mr-1">
              <AnimatePresence initial={false}>
                {attendances.map((a, i) => (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: i * 0.02 }}
                    className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 hover:bg-muted/60 transition group"
                  >
                    <div className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold shrink-0",
                      a.subscriber.gender === "ذكر" ? "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300"
                      : "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300"
                    )}>
                      {a.subscriber.lastName[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {a.subscriber.lastName} {a.subscriber.firstName}
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="font-mono">{new Date(a.checkInTime).toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" })}</span>
                        <span>•</span>
                        <Badge variant="outline" className={cn(
                          "h-4 text-[9px] px-1",
                          a.method === "qr" ? "bg-violet-500/15 text-violet-700 border-violet-500/30"
                          : "bg-amber-500/15 text-amber-700 border-amber-500/30"
                        )}>
                          {a.method === "qr" ? "QR" : "يدوي"}
                        </Badge>
                        {a.note && <span className="text-orange-600 text-[10px]">{a.note}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(a.id)}
                      className="opacity-0 group-hover:opacity-100 transition p-1 hover:bg-rose-500/10 rounded text-rose-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* QR Scanner */}
      <QRScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onCheckIn={() => { fetchAttendance(); fetchLive(); onRefresh?.(); }}
      />
    </div>
  );
}

function StatPill({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: "emerald" | "violet" | "amber" | "rose";
}) {
  const colors = {
    emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    violet: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    rose: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  };
  return (
    <div className={cn("rounded-xl p-2.5 flex items-center gap-2", colors[color])}>
      <Icon className="h-4 w-4 shrink-0" />
      <div>
        <p className="text-lg font-extrabold leading-none tabular-nums">{value}</p>
        <p className="text-[10px] opacity-80 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function HeatmapView({ data }: { data: HeatmapData }) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const colorFor = (v: number) => {
    if (v === 0) return "bg-muted/30";
    const ratio = v / (data.max || 1);
    if (ratio < 0.25) return "bg-emerald-500/30";
    if (ratio < 0.5) return "bg-emerald-500/50";
    if (ratio < 0.75) return "bg-amber-500/60";
    return "bg-rose-500/70";
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="rounded-2xl border border-border/60 bg-card p-4 overflow-x-auto"
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-bold text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" /> خريطة الازدحام (آخر 90 يوم)
        </h3>
        <div className="flex items-center gap-2 text-xs">
          <span>أقل</span>
          <div className="flex gap-0.5">
            <div className="h-3 w-3 rounded bg-muted/30" />
            <div className="h-3 w-3 rounded bg-emerald-500/30" />
            <div className="h-3 w-3 rounded bg-emerald-500/50" />
            <div className="h-3 w-3 rounded bg-amber-500/60" />
            <div className="h-3 w-3 rounded bg-rose-500/70" />
          </div>
          <span>أكثر</span>
        </div>
      </div>

      <div className="min-w-[600px]">
        <table className="w-full text-[10px]">
          <thead>
            <tr>
              <th className="text-right p-1 w-20">اليوم / الساعة</th>
              {hours.filter((h) => h >= 6 && h <= 22).map((h) => (
                <th key={h} className="p-1 text-center font-mono">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.matrix.map((row, dow) => (
              <tr key={dow}>
                <td className="p-1 text-right font-semibold text-xs">{data.dayNames[dow]}</td>
                {hours.filter((h) => h >= 6 && h <= 22).map((h) => {
                  const v = row[h];
                  return (
                    <td key={h} className="p-0.5">
                      <div
                        className={cn("h-7 rounded flex items-center justify-center font-mono text-[9px] font-bold", colorFor(v))}
                        title={`${data.dayNames[dow]} ${h}:00 — ${v} حضور`}
                      >
                        {v > 0 ? v : ""}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Best slot summary */}
      <div className="mt-3 pt-3 border-t">
        <h4 className="text-xs font-bold mb-2 text-muted-foreground">التوزيع حسب الفوج:</h4>
        <div className="flex flex-wrap gap-2">
          {Object.entries(data.bySlot).sort((a, b) => b[1] - a[1]).map(([slot, count]) => (
            <Badge key={slot} variant="outline" className="text-xs">
              {slot}: <span className="font-bold tabular-nums mr-1">{count}</span>
            </Badge>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
