"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileSpreadsheet, FileText, Users, Calendar, RefreshCw, Wallet,
  Download, Loader2, ShieldCheck, Building2, Inbox, FileType,
  PenTool, Check, Printer, Badge as BadgeIcon, BarChart3,
  Droplet, Clock, Crown, Tag, MapPin, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// الترويسة الموحدة تم نقلها إلى: الإعدادات → إعدادات النادي → الترويسة الموحدة (EN-TÊTE)

interface ExportOption {
  type: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  narrow?: boolean;
}

const SIGNATURES = [
  { id: "president", label: "إمضاء رئيس الجمعية" },
  { id: "branch", label: "رئيس الفرع" },
  { id: "manager", label: "مدير الوحدة" },
  { id: "compound", label: "مدير ديوان المركب" },
  { id: "insurance", label: "تأشيرة التأمين" },
];

export function ExportPanel({ onOpenReport }: { onOpenReport?: (id: string) => void }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [sigModal, setSigModal] = useState<{ open: boolean; type: string; format: string } | null>(null);
  const [selectedSigs, setSelectedSigs] = useState<string[]>(["president", "branch"]);

  const toggleSig = (id: string) => {
    setSelectedSigs((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  };

  const handleExport = async (type: string, format: "xlsx" | "pdf" | "word") => {
    if (format === "word" || format === "pdf") {
      setSigModal({ open: true, type, format });
      return;
    }
    await doExport(type, format, []);
  };

  const doExport = async (type: string, format: string, sigs: string[]) => {
    setDownloading(`${type}-${format}`);
    setSigModal(null);
    try {
      const params = new URLSearchParams({ format, type });
      if (sigs.length > 0) params.set("sigs", sigs.join(","));
      const res = await fetch(`/api/export?${params.toString()}`);
      if (!res.ok) throw new Error("فشل التصدير");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const filename = res.headers.get("Content-Disposition")?.split('filename="')[1]?.split('"')[0] || `RCS_${type}.${format === "word" ? "doc" : format}`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`تم تصدير ${filename}`);
    } catch {
      toast.error("فشل التصدير");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* ═══ تذكير بنقل الترويسة ═══ */}
      <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
        <FileText className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1">
          <p className="font-bold text-sm">الترويسة الموحدة (EN-TÊTE)</p>
          <p className="text-xs text-muted-foreground">تُدار الآن من: الإعدادات → إعدادات النادي → الترويسة الموحدة — تنعكس تلقائياً على كل التقارير</p>
        </div>
      </div>

      {/* ═══ مركز التقارير ═══ */}
      <ReportsCenter onOpenReport={onOpenReport} />

      {/* ═══ التصدير السريع التقليدي ═══ */}
      <QuickExports onExport={handleExport} downloading={downloading} />

      {/* Signature selection modal */}
      <AnimatePresence>
        {sigModal?.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setSigModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-card rounded-2xl p-6 max-w-md w-full space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <PenTool className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-base">اختيار الإمضاءات</h3>
              </div>
              <p className="text-xs text-muted-foreground">اختر الإمضاءات التي تريد إظهارها في أسفل الملف. ستظهر في سطر واحد متساوية.</p>
              <div className="space-y-2">
                {SIGNATURES.map((sig) => (
                  <button
                    key={sig.id}
                    onClick={() => toggleSig(sig.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl border-2 text-sm transition",
                      selectedSigs.includes(sig.id) ? "border-primary bg-primary/10" : "border-border hover:bg-accent"
                    )}
                  >
                    <div className={cn("h-5 w-5 rounded-md border-2 flex items-center justify-center", selectedSigs.includes(sig.id) ? "bg-primary border-primary text-primary-foreground" : "border-border")}>
                      {selectedSigs.includes(sig.id) && <Check className="h-3 w-3" strokeWidth={3} />}
                    </div>
                    <span className="font-medium">{sig.label}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2 pt-2 border-t">
                <Button variant="outline" className="flex-1" onClick={() => setSigModal(null)}>إلغاء</Button>
                <Button className="flex-1" onClick={() => doExport(sigModal.type, sigModal.format, selectedSigs)}>
                  <Download className="h-4 w-4 ml-1" /> تصدير {sigModal.format === "word" ? "Word" : "PDF"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ════════════ Reports Center (15 reports hub) ════════════
const REPORTS: { id: string; title: string; description: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { id: "subscribers-list", title: "قائمة المنخرطين", description: "الفلترة حسب النوع، الجنس، العمر، الاشتراك، الحالة", icon: Users, color: "from-teal-500/15 to-teal-500/5 border-teal-500/30" },
  { id: "insurance-list", title: "قائمة التأمين", description: "مؤمنون / غير مؤمنين / الكل", icon: ShieldCheck, color: "from-emerald-500/15 to-emerald-500/5 border-emerald-500/30" },
  { id: "compound-rights", title: "حقوق دخول المركب", description: "المنخرطون الذين رسمهم ≥ 1300 دج", icon: Building2, color: "from-sky-500/15 to-sky-500/5 border-sky-500/30" },
  { id: "renewals", title: "قائمة التجديدات", description: "اليوم / الأسبوع / الشهر / فترة", icon: RefreshCw, color: "from-fuchsia-500/15 to-fuchsia-500/5 border-fuchsia-500/30" },
  { id: "attendance", title: "سجل الحضور", description: "حسب اليوم / الفترة / المدرب / الحصة", icon: Calendar, color: "from-amber-500/15 to-amber-500/5 border-amber-500/30" },
  { id: "financial", title: "التقرير المالي", description: "الإيرادات، المصاريف، الرصيد + رسوم بيانية", icon: Wallet, color: "from-rose-500/15 to-rose-500/5 border-rose-500/30" },
  { id: "expired", title: "الاشتراكات المنتهية", description: "المنتهية + خلال 7 أيام + خلال 30 يوماً", icon: Calendar, color: "from-orange-500/15 to-orange-500/5 border-orange-500/30" },
  { id: "absence", title: "تقرير الغياب", description: "عدد الغيابات + آخر حضور + نسبة الحضور", icon: Activity, color: "from-red-500/15 to-red-500/5 border-red-500/30" },
  { id: "age-categories", title: "الفئات العمرية", description: "عدد المنخرطين حسب كل فئة عمرية", icon: Crown, color: "from-violet-500/15 to-violet-500/5 border-violet-500/30" },
  { id: "subscription-types", title: "أنواع الاشتراك", description: "عادي، OPW، DJS، FCS، RCS، POLICE وغيرها", icon: Tag, color: "from-cyan-500/15 to-cyan-500/5 border-cyan-500/30" },
  { id: "swimming-days", title: "أيام السباحة", description: "عدد المنخرطين حسب كل يوم", icon: Calendar, color: "from-indigo-500/15 to-indigo-500/5 border-indigo-500/30" },
  { id: "swimming-times", title: "أوقات السباحة", description: "عدد المنخرطين حسب كل توقيت", icon: Clock, color: "from-blue-500/15 to-blue-500/5 border-blue-500/30" },
  { id: "blood-types", title: "فصائل الدم", description: "إحصائيات حسب فصيلة الدم", icon: Droplet, color: "from-pink-500/15 to-pink-500/5 border-pink-500/30" },
  { id: "ages", title: "تقرير الأعمار", description: "إحصائيات حسب العمر", icon: Users, color: "from-lime-500/15 to-lime-500/5 border-lime-500/30" },
  { id: "coaches", title: "تقرير المدربين", description: "عدد المنخرطين لكل مدرب", icon: Users, color: "from-purple-500/15 to-purple-500/5 border-purple-500/30" },
];

function ReportsCenter({ onOpenReport }: { onOpenReport?: (id: string) => void }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h3 className="font-bold text-base">مركز التقارير</h3>
        <Badge variant="outline" className="text-[10px]">{REPORTS.length} تقرير</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        اضغط على أي تقرير لفتح واجهة كاملة مستقلة — تحتوي على الترويسة الموحدة + إحصائيات + فلاتر + جدول + ترقيم صفحات + تصدير PDF/Word/Excel/طباعة
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {REPORTS.map((r, i) => {
          const Icon = r.icon;
          return (
            <motion.button
              key={r.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => onOpenReport?.(r.id)}
              className={cn("text-right rounded-2xl border-2 bg-gradient-to-br p-4 hover:scale-[1.02] transition-transform", r.color)}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/60 dark:bg-black/20 shrink-0">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">{r.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/30">
                <span className="text-[10px] text-muted-foreground">فتح التقرير</span>
                <FileText className="h-3.5 w-3.5 text-primary" />
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ════════════ Quick Exports (traditional direct exports) ════════════
function QuickExports({
  onExport,
  downloading,
}: {
  onExport: (type: string, format: "xlsx" | "pdf" | "word") => void;
  downloading: string | null;
}) {
  const QUICK: ExportOption[] = [
    { type: "subscribers", title: "تصدير سريع — قائمة المنخرطين", description: "Word/PDF/Excel مع الترويسة + الإمضاءات", icon: Users, color: "from-teal-500/15 to-teal-500/5 border-teal-500/30" },
    { type: "compound", title: "تصدير سريع — حقوق المركب", description: "اللقب، الاسم، المبلغ (1000 دج)", icon: Building2, color: "from-sky-500/15 to-sky-500/5 border-sky-500/30" },
    { type: "incoming", title: "تصدير سريع — قائمة الوارد", description: "سجل المدفوعات الواردة — هوامش ضيقة", icon: Inbox, color: "from-violet-500/15 to-violet-500/5 border-violet-500/30", narrow: true },
    { type: "renewals", title: "تصدير سريع — التجديدات", description: "تاريخ تجديدات الاشتراكات", icon: RefreshCw, color: "from-fuchsia-500/15 to-fuchsia-500/5 border-fuchsia-500/30" },
  ];

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <h3 className="font-bold text-sm mb-1 flex items-center gap-2">
        <Download className="h-4 w-4 text-primary" /> تصدير سريع
      </h3>
      <p className="text-xs text-muted-foreground mb-4">تصدير مباشر بصيغة Word أو PDF أو Excel — مع الإمضاءات والترويسة الموحدة</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {QUICK.map((opt) => {
          const Icon = opt.icon;
          return (
            <div key={opt.type} className={cn("rounded-2xl border-2 bg-gradient-to-br p-3", opt.color)}>
              <div className="flex items-start gap-2 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/60 dark:bg-black/20 shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-xs">{opt.title}</p>
                  <p className="text-[11px] text-muted-foreground">{opt.description}</p>
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs bg-white/60 dark:bg-black/20" onClick={() => onExport(opt.type, "word")} disabled={downloading === `${opt.type}-word`}>
                  {downloading === `${opt.type}-word` ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileType className="h-3 w-3 ml-1" />} Word
                </Button>
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs bg-white/60 dark:bg-black/20" onClick={() => onExport(opt.type, "pdf")} disabled={downloading === `${opt.type}-pdf`}>
                  {downloading === `${opt.type}-pdf` ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3 ml-1" />} PDF
                </Button>
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs bg-white/60 dark:bg-black/20" onClick={() => onExport(opt.type, "xlsx")} disabled={downloading === `${opt.type}-xlsx`}>
                  {downloading === `${opt.type}-xlsx` ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSpreadsheet className="h-3 w-3 ml-1" />} Excel
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

