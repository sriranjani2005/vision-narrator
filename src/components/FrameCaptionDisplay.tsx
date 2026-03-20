import React from "react";
import { motion } from "framer-motion";
import { Eye } from "lucide-react";

interface CaptionResult {
  timeLabel: string;
  caption: string;
  importance: number;
}

interface FrameCaptionDisplayProps {
  frames: { timeLabel: string; dataUrl: string }[];
  captions: CaptionResult[];
  showFrames: boolean;
}

const FrameCaptionDisplay: React.FC<FrameCaptionDisplayProps> = ({
  frames,
  captions,
  showFrames,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <h3 className="font-mono text-sm text-primary glow-text flex items-center gap-2">
        <Eye className="w-4 h-4" /> FRAME-LEVEL CAPTIONS
      </h3>

      <div className="space-y-3">
        {captions.map((cap, i) => {
          const frame = frames[i];
          const barWidth = Math.max(cap.importance * 100, 10);
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-card border border-border rounded-lg overflow-hidden hover:border-primary/30 transition-colors"
            >
              <div className="flex items-stretch">
                {showFrames && frame && (
                  <div className="w-40 h-24 flex-shrink-0 relative">
                    <img
                      src={frame.dataUrl}
                      alt={`Frame at ${cap.timeLabel}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 scan-line pointer-events-none opacity-40" />
                  </div>
                )}
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <span className="font-mono text-xs text-timestamp">
                        [{cap.timeLabel}]
                      </span>
                      <p className="text-foreground text-sm mt-1">{cap.caption}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-mono text-xs text-muted-foreground">
                        ATT: {(cap.importance * 100).toFixed(0)}%
                      </span>
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${barWidth}%`,
                            background: `linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default FrameCaptionDisplay;
