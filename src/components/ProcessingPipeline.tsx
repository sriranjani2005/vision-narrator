import React from "react";
import { motion } from "framer-motion";

interface ProcessingPipelineProps {
  currentStage: number; // 0-5
  stages: string[];
}

const ProcessingPipeline: React.FC<ProcessingPipelineProps> = ({ currentStage, stages }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-card border border-border rounded-lg p-6"
    >
      <h3 className="font-mono text-sm text-primary mb-4 glow-text">
        ▶ HAVCM PIPELINE
      </h3>
      <div className="space-y-3">
        {stages.map((stage, i) => {
          const isActive = i === currentStage;
          const isDone = i < currentStage;
          return (
            <div key={i} className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded flex items-center justify-center font-mono text-xs transition-all duration-500 ${
                  isDone
                    ? "bg-success/20 text-success border border-success/30"
                    : isActive
                    ? "bg-primary/20 text-primary border border-primary/50 animate-pulse-glow"
                    : "bg-muted text-muted-foreground border border-border"
                }`}
              >
                {isDone ? "✓" : i + 1}
              </div>
              <span
                className={`font-mono text-sm transition-colors ${
                  isDone
                    ? "text-success"
                    : isActive
                    ? "text-primary glow-text"
                    : "text-muted-foreground"
                }`}
              >
                {stage}
              </span>
              {isActive && (
                <motion.div
                  className="h-0.5 flex-1 bg-primary/30 rounded overflow-hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <motion.div
                    className="h-full bg-primary"
                    animate={{ x: ["-100%", "100%"] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  />
                </motion.div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default ProcessingPipeline;
