import React, { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Camera, Cpu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractFrames, type ExtractedFrame } from "@/lib/frameExtractor";
import { type LanguageCode } from "@/lib/languages";
import VideoUpload from "@/components/VideoUpload";
import ProcessingPipeline from "@/components/ProcessingPipeline";
import FrameCaptionDisplay from "@/components/FrameCaptionDisplay";
import SummaryDisplay from "@/components/SummaryDisplay";
import TranslationPanel from "@/components/TranslationPanel";
import ArchitectureDiagram from "@/components/ArchitectureDiagram";
import ExportButton from "@/components/ExportButton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface CaptionResult {
  timeLabel: string;
  caption: string;
  importance: number;
}

interface SummaryResult {
  summary: string;
  keyEvents: string[];
  alertLevel: "normal" | "attention" | "alert";
}

const PIPELINE_STAGES = [
  "Frame Extraction",
  "CNN Feature Extraction (EfficientNet-B0)",
  "BiLSTM Temporal Modeling",
  "Attention Mechanism",
  "Transformer Caption Generation",
  "Summary & Translation Ready",
];

const Index: React.FC = () => {
  const [frames, setFrames] = useState<ExtractedFrame[]>([]);
  const [captions, setCaptions] = useState<CaptionResult[]>([]);
  const [summaryResult, setSummaryResult] = useState<SummaryResult | null>(null);
  const [pipelineStage, setPipelineStage] = useState(-1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showFrames, setShowFrames] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>("en");
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatedCaptions, setTranslatedCaptions] = useState<{ timeLabel: string; caption: string }[] | null>(null);
  const [translatedSummary, setTranslatedSummary] = useState<string | null>(null);
  const [videoName, setVideoName] = useState("");
  const [frameCount, setFrameCount] = useState(12);

  const runCaptionPipeline = useCallback(async (
    extractedFrames: { timeLabel: string; imageBase64: string }[],
    name: string
  ) => {
    // Stage 1-3: Simulated CNN + BiLSTM + Attention
    for (let stage = 1; stage <= 3; stage++) {
      setPipelineStage(stage);
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Stage 4: Caption Generation
    setPipelineStage(4);
    toast.info("Generating captions with Vision AI...");
    const { data: captionData, error: captionError } = await supabase.functions.invoke("video-caption", {
      body: {
        action: "caption",
        frames: extractedFrames,
      },
    });
    if (captionError) throw captionError;
    if (captionData.error) throw new Error(captionData.error);
    setCaptions(captionData.captions);

    // Stage 5: Summary
    setPipelineStage(5);
    toast.info("Generating video summary...");
    const { data: summaryData, error: summaryError } = await supabase.functions.invoke("video-caption", {
      body: {
        action: "summarize",
        captions: captionData.captions,
      },
    });
    if (summaryError) throw summaryError;
    if (summaryData.error) throw new Error(summaryData.error);
    setSummaryResult(summaryData);
    toast.success("Video analysis complete!");
  }, []);

  const processVideo = useCallback(async (file: File) => {
    setIsProcessing(true);
    setCaptions([]);
    setSummaryResult(null);
    setTranslatedCaptions(null);
    setTranslatedSummary(null);
    setVideoName(file.name);

    try {
      setPipelineStage(0);
      toast.info(`Extracting ${frameCount} frames from video...`);
      const extracted = await extractFrames(file, frameCount);
      setFrames(extracted);

      await runCaptionPipeline(
        extracted.map((f) => ({ timeLabel: f.timeLabel, imageBase64: f.dataUrl })),
        file.name
      );
    } catch (err: any) {
      console.error("Processing error:", err);
      toast.error(err.message || "Failed to process video");
    } finally {
      setIsProcessing(false);
    }
  }, [frameCount, runCaptionPipeline]);

  const processYouTube = useCallback(async (url: string) => {
    setIsProcessing(true);
    setCaptions([]);
    setSummaryResult(null);
    setTranslatedCaptions(null);
    setTranslatedSummary(null);
    setVideoName(url);

    try {
      setPipelineStage(0);
      toast.info("Fetching YouTube video thumbnails...");

      const { data, error } = await supabase.functions.invoke("video-caption", {
        body: { action: "youtube_info", youtubeUrl: url },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setVideoName(data.title || url);

      // Convert to ExtractedFrame format for display
      const ytFrames: ExtractedFrame[] = data.frames.map((f: any, i: number) => ({
        timestamp: i,
        timeLabel: f.timeLabel,
        dataUrl: f.imageBase64,
        blob: new Blob(),
      }));
      setFrames(ytFrames);

      await runCaptionPipeline(data.frames, data.title);
    } catch (err: any) {
      console.error("YouTube processing error:", err);
      toast.error(err.message || "Failed to process YouTube video");
    } finally {
      setIsProcessing(false);
    }
  }, [runCaptionPipeline]);

  const handleTranslate = useCallback(async () => {
    if (!captions.length || !summaryResult) return;
    setIsTranslating(true);
    setTranslatedCaptions(null);
    setTranslatedSummary(null);

    try {
      const { data, error } = await supabase.functions.invoke("video-caption", {
        body: {
          action: "translate",
          captions,
          summary: summaryResult.summary,
          targetLanguage: selectedLanguage,
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setTranslatedCaptions(data.translatedCaptions);
      setTranslatedSummary(data.translatedSummary);
      toast.success("Translation complete!");
    } catch (err: any) {
      toast.error(err.message || "Translation failed");
    } finally {
      setIsTranslating(false);
    }
  }, [captions, summaryResult, selectedLanguage]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center">
              <Camera className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">HAVCM</h1>
              <p className="text-xs font-mono text-muted-foreground">
                Hierarchical Attention-based Video Captioning
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary animate-pulse-glow" />
            <span className="font-mono text-xs text-muted-foreground">
              CNN → BiLSTM → Attention → Transformer
            </span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {!isProcessing && captions.length === 0 && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
              AI-Powered <span className="text-primary glow-text">Video Analysis</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Upload any video or paste a YouTube link to generate frame-level captions,
              video summaries, and multilingual translations.
            </p>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="space-y-6">
            <VideoUpload
              onFileSelect={processVideo}
              onYouTubeSubmit={processYouTube}
              isProcessing={isProcessing}
              frameCount={frameCount}
              onFrameCountChange={setFrameCount}
            />
            <ArchitectureDiagram />
          </div>

          <div className="lg:col-span-2 space-y-6">
            {isProcessing && (
              <ProcessingPipeline currentStage={pipelineStage} stages={PIPELINE_STAGES} />
            )}

            {videoName && (
              <div className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3">
                <span className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">
                  📂 {videoName}
                </span>
                <div className="flex items-center gap-4">
                  {captions.length > 0 && summaryResult && (
                    <ExportButton
                      videoName={videoName}
                      captions={captions}
                      summary={summaryResult.summary}
                      keyEvents={summaryResult.keyEvents}
                      alertLevel={summaryResult.alertLevel}
                      translatedCaptions={translatedCaptions}
                      translatedSummary={translatedSummary}
                    />
                  )}
                  {captions.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Switch id="show-frames" checked={showFrames} onCheckedChange={setShowFrames} />
                      <Label htmlFor="show-frames" className="text-xs text-muted-foreground">Show frames</Label>
                    </div>
                  )}
                </div>
              </div>
            )}

            {captions.length > 0 && (
              <>
                <FrameCaptionDisplay frames={frames} captions={captions} showFrames={showFrames} />
                {summaryResult && (
                  <SummaryDisplay
                    summary={summaryResult.summary}
                    keyEvents={summaryResult.keyEvents}
                    alertLevel={summaryResult.alertLevel}
                  />
                )}
                <TranslationPanel
                  selectedLanguage={selectedLanguage}
                  onLanguageChange={(lang) => { setSelectedLanguage(lang); setTranslatedCaptions(null); setTranslatedSummary(null); }}
                  onTranslate={handleTranslate}
                  isTranslating={isTranslating}
                  translatedCaptions={translatedCaptions}
                  translatedSummary={translatedSummary}
                />
              </>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-border mt-16 py-6">
        <div className="container mx-auto px-4 text-center">
          <p className="font-mono text-xs text-muted-foreground">
            HAVCM — Designed for CCTV monitoring & accessibility
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
