import React from "react";
import { motion } from "framer-motion";
import { FileText, AlertTriangle, Shield, ShieldAlert } from "lucide-react";

interface SummaryDisplayProps {
  summary: string;
  keyEvents: string[];
  alertLevel: "normal" | "attention" | "alert";
}

const alertConfig = {
  normal: { icon: Shield, label: "NORMAL", colorClass: "text-success", bgClass: "bg-success/10 border-success/30" },
  attention: { icon: AlertTriangle, label: "ATTENTION", colorClass: "text-warning", bgClass: "bg-warning/10 border-warning/30" },
  alert: { icon: ShieldAlert, label: "ALERT", colorClass: "text-destructive", bgClass: "bg-destructive/10 border-destructive/30" },
};

const SummaryDisplay: React.FC<SummaryDisplayProps> = ({ summary, keyEvents, alertLevel }) => {
  const alert = alertConfig[alertLevel];
  const AlertIcon = alert.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <h3 className="font-mono text-sm text-primary glow-text flex items-center gap-2">
        <FileText className="w-4 h-4" /> VIDEO SUMMARY
      </h3>

      <div className={`border rounded-lg p-4 ${alert.bgClass}`}>
        <div className="flex items-center gap-2 mb-2">
          <AlertIcon className={`w-5 h-5 ${alert.colorClass}`} />
          <span className={`font-mono text-sm font-bold ${alert.colorClass}`}>
            {alert.label}
          </span>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <p className="text-foreground leading-relaxed">{summary}</p>
      </div>

      {keyEvents.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-5">
          <h4 className="font-mono text-xs text-muted-foreground mb-3">KEY EVENTS DETECTED</h4>
          <ul className="space-y-2">
            {keyEvents.map((event, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-start gap-2 text-sm"
              >
                <span className="text-primary mt-0.5">▸</span>
                <span className="text-foreground">{event}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
};

export default SummaryDisplay;
