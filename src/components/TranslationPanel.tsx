import React from "react";
import { motion } from "framer-motion";
import { Globe } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@/lib/languages";

interface TranslationPanelProps {
  selectedLanguage: LanguageCode;
  onLanguageChange: (lang: LanguageCode) => void;
  onTranslate: () => void;
  isTranslating: boolean;
  translatedCaptions: { timeLabel: string; caption: string }[] | null;
  translatedSummary: string | null;
}

const TranslationPanel: React.FC<TranslationPanelProps> = ({
  selectedLanguage,
  onLanguageChange,
  onTranslate,
  isTranslating,
  translatedCaptions,
  translatedSummary,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <h3 className="font-mono text-sm text-primary glow-text flex items-center gap-2">
        <Globe className="w-4 h-4" /> MULTILINGUAL TRANSLATION
      </h3>

      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedLanguage} onValueChange={(v) => onLanguageChange(v as LanguageCode)}>
            <SelectTrigger className="w-56 bg-muted border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="cyber" onClick={onTranslate} disabled={isTranslating || selectedLanguage === "en"}>
            {isTranslating ? "Translating..." : "Translate"}
          </Button>
        </div>

        {translatedCaptions && (
          <div className="mt-5 space-y-3">
            <h4 className="font-mono text-xs text-muted-foreground">TRANSLATED CAPTIONS</h4>
            <div className="space-y-2">
              {translatedCaptions.map((cap, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className="font-mono text-timestamp shrink-0">[{cap.timeLabel}]</span>
                  <span className="text-foreground">{cap.caption}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {translatedSummary && (
          <div className="mt-5">
            <h4 className="font-mono text-xs text-muted-foreground mb-2">TRANSLATED SUMMARY</h4>
            <p className="text-foreground text-sm leading-relaxed bg-muted/50 rounded p-3">{translatedSummary}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default TranslationPanel;
