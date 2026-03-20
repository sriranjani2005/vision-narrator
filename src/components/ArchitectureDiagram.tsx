import React from "react";
import { motion } from "framer-motion";

const ArchitectureDiagram: React.FC = () => {
  const layers = [
    { label: "Video Input", icon: "📹", desc: "Raw surveillance footage" },
    { label: "Frame Extraction", icon: "🖼️", desc: "5–10 key frames with timestamps" },
    { label: "CNN (EfficientNet-B0)", icon: "🧠", desc: "Spatial feature extraction: f_i = CNN(frame_i)" },
    { label: "BiLSTM", icon: "↔️", desc: "Temporal modeling: h_t = BiLSTM(f_t, h_{t-1})" },
    { label: "Attention Mechanism", icon: "🎯", desc: "α_t = softmax(e_t) → Context: c = Σ(α_t · h_t)" },
    { label: "Transformer Decoder", icon: "✨", desc: "Caption = Transformer(c)" },
    { label: "Translation + Summary", icon: "🌍", desc: "Multilingual output + TextRank summary" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-card border border-border rounded-lg p-6"
    >
      <h3 className="font-mono text-sm text-primary mb-6 glow-text">
        ▶ MODEL ARCHITECTURE
      </h3>
      <div className="space-y-1">
        {layers.map((layer, i) => (
          <React.Fragment key={i}>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors group"
            >
              <span className="text-xl">{layer.icon}</span>
              <div className="flex-1">
                <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  {layer.label}
                </span>
                <p className="font-mono text-xs text-muted-foreground">{layer.desc}</p>
              </div>
            </motion.div>
            {i < layers.length - 1 && (
              <div className="flex justify-center">
                <div className="w-px h-3 bg-primary/30" />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </motion.div>
  );
};

export default ArchitectureDiagram;
