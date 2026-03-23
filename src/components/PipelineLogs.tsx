import React, { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Terminal, ChevronDown, ChevronUp } from "lucide-react";

interface PipelineLogsProps {
  logs: string[];
  isProcessing: boolean;
}

const PipelineLogs: React.FC<PipelineLogsProps> = ({ logs, isProcessing }) => {
  const [expanded, setExpanded] = React.useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-lg overflow-hidden"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary" />
          <span className="font-mono text-xs font-semibold text-foreground">
            Pipeline Console
          </span>
          {isProcessing && (
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {logs.length} log entries
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div
          ref={scrollRef}
          className="bg-[hsl(var(--background))] border-t border-border px-4 py-3 max-h-64 overflow-y-auto font-mono text-xs"
        >
          {logs.map((log, i) => (
            <div
              key={i}
              className={`py-0.5 ${
                log.includes("✓")
                  ? "text-green-400"
                  : log.includes("✗") || log.includes("error")
                  ? "text-red-400"
                  : log.includes("STAGE") || log.includes("===")
                  ? "text-primary font-bold"
                  : log.includes("⚠")
                  ? "text-yellow-400"
                  : "text-muted-foreground"
              }`}
            >
              {log}
            </div>
          ))}
          {isProcessing && (
            <div className="text-primary animate-pulse py-0.5">
              ▌ Processing...
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default PipelineLogs;
