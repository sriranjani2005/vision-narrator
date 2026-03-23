import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Camera, Cpu, Server, Cloud } from "lucide-react";
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
import PipelineLogs from "@/components/PipelineLogs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  "Frame Extraction (OpenCV)",
  "CNN Feature Extraction (EfficientNet-B0)",
  "BiLSTM Temporal Modeling (2-layer, bidirectional)",
  "Attention Mechanism (Multi-Head + Temporal)",
  "Transformer Caption Decoder (BLIP)",
  "TextRank Summary + Translation",
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
  const [pipelineLogs, setPipelineLogs] = useState<string[]>([]);
  const [backendMode, setBackendMode] = useState<"cloud" | "local">("cloud");
  const [localBackendUrl, setLocalBackendUrl] = useState("http://localhost:8000");

  // =============================================
  // LOCAL BACKEND (FastAPI + PyTorch) PIPELINE
  // =============================================
  const processVideoLocal = useCallback(async (file: File) => {
    setIsProcessing(true);
    setCaptions([]);
    setSummaryResult(null);
    setTranslatedCaptions(null);
    setTranslatedSummary(null);
    setPipelineLogs([]);
    setVideoName(file.name);

    try {
      setPipelineStage(0);
      toast.info("Sending video to DL backend...");
      setPipelineLogs(prev => [...prev, `[0.00s] Uploading ${file.name} to HAVCM backend...`]);

      const formData = new FormData();
      formData.append("video", file);
      formData.append("num_frames", String(frameCount));

      // Simulate pipeline stages with timing
      const stageTimer = setInterval(() => {
        setPipelineStage(prev => Math.min(prev + 1, 5));
      }, 2000);

      const response = await fetch(`${localBackendUrl}/generate-caption`, {
        method: "POST",
        body: formData,
      });

      clearInterval(stageTimer);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Backend error: ${response.status}`);
      }

      const data = await response.json();
      setPipelineStage(5);

      // Set pipeline logs from backend
      if (data.pipeline_logs) {
        setPipelineLogs(data.pipeline_logs);
      }

      // Convert backend response to frontend format
      const extractedFrames: ExtractedFrame[] = (data.frame_images || []).map((img: string, i: number) => ({
        timestamp: data.captions[i]?.timestamp_sec || i,
        timeLabel: data.captions[i]?.time || `Frame ${i + 1}`,
        dataUrl: img,
        blob: new Blob(),
      }));
      setFrames(extractedFrames);

      const captionResults: CaptionResult[] = (data.captions || []).map((c: any) => ({
        timeLabel: c.time,
        caption: c.text,
        importance: c.confidence || c.attention_weight || 0.5,
      }));
      setCaptions(captionResults);

      if (data.summary) {
        setSummaryResult({
          summary: data.summary,
          keyEvents: data.captions?.map((c: any) => `[${c.time}] ${c.text}`) || [],
          alertLevel: "normal",
        });
      }

      toast.success(`Pipeline complete in ${data.processing_time}s!`);
    } catch (err: any) {
      console.error("Local backend error:", err);
      if (err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError")) {
        toast.error("Cannot connect to local backend. Make sure it's running: uvicorn app:app --reload --port 8000");
      } else {
        toast.error(err.message || "Failed to process video");
      }
    } finally {
      setIsProcessing(false);
    }
  }, [frameCount, localBackendUrl]);

  // =============================================
  // CLOUD BACKEND (Supabase Edge Functions) 
  // =============================================
  const runCaptionPipeline = useCallback(async (
    extractedFrames: { timeLabel: string; imageBase64: string }[],
    name: string
  ) => {
    for (let stage = 1; stage <= 3; stage++) {
      setPipelineStage(stage);
      setPipelineLogs(prev => [...prev, `[${stage}.0s] ${PIPELINE_STAGES[stage]} — processing...`]);
      await new Promise((r) => setTimeout(r, 1000));
    }

    setPipelineStage(4);
    setPipelineLogs(prev => [...prev, "[4.0s] Generating captions with Vision AI..."]);
    toast.info("Generating captions with Vision AI...");
    const { data: captionData, error: captionError } = await supabase.functions.invoke("video-caption", {
      body: { action: "caption", frames: extractedFrames },
    });
    if (captionError) throw captionError;
    if (captionData.error) throw new Error(captionData.error);
    setCaptions(captionData.captions);
    setPipelineLogs(prev => [...prev, `  ✓ Generated ${captionData.captions.length} captions`]);

    setPipelineStage(5);
    setPipelineLogs(prev => [...prev, "[5.0s] Generating video summary..."]);
    toast.info("Generating video summary...");
    const { data: summaryData, error: summaryError } = await supabase.functions.invoke("video-caption", {
      body: { action: "summarize", captions: captionData.captions },
    });
    if (summaryError) throw summaryError;
    if (summaryData.error) throw new Error(summaryData.error);
    setSummaryResult(summaryData);
    setPipelineLogs(prev => [...prev, "  ✓ Summary generated", "PIPELINE COMPLETE"]);
    toast.success("Video analysis complete!");
  }, []);

  const processVideoCloud = useCallback(async (file: File) => {
    setIsProcessing(true);
    setCaptions([]);
    setSummaryResult(null);
    setTranslatedCaptions(null);
    setTranslatedSummary(null);
    setPipelineLogs([]);
    setVideoName(file.name);

    try {
      setPipelineStage(0);
      setPipelineLogs([`[0.0s] Extracting ${frameCount} frames from video...`]);
      toast.info(`Extracting ${frameCount} frames from video...`);
      const extracted = await extractFrames(file, frameCount);
      setFrames(extracted);
      setPipelineLogs(prev => [...prev, `  ✓ Extracted ${extracted.length} frames`]);

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

  const processVideo = useCallback(async (file: File) => {
    if (backendMode === "local") {
      await processVideoLocal(file);
    } else {
      await processVideoCloud(file);
    }
  }, [backendMode, processVideoLocal, processVideoCloud]);

  const processYouTube = useCallback(async (url: string) => {
    setIsProcessing(true);
    setCaptions([]);
    setSummaryResult(null);
    setTranslatedCaptions(null);
    setTranslatedSummary(null);
    setPipelineLogs([]);
    setVideoName(url);

    try {
      setPipelineStage(0);
      setPipelineLogs(["[0.0s] Fetching YouTube video thumbnails..."]);
      toast.info("Fetching YouTube video thumbnails...");

      const { data, error } = await supabase.functions.invoke("video-caption", {
        body: { action: "youtube_info", youtubeUrl: url },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setVideoName(data.title || url);

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
          <div className="flex items-center gap-4">
            {/* Backend mode selector */}
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5">
              <button
                onClick={() => setBackendMode("cloud")}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono transition-colors ${
                  backendMode === "cloud" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Cloud className="w-3 h-3" /> Cloud
              </button>
              <button
                onClick={() => setBackendMode("local")}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono transition-colors ${
                  backendMode === "local" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Server className="w-3 h-3" /> Local DL
              </button>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary animate-pulse-glow" />
              <span className="font-mono text-xs text-muted-foreground">
                CNN → BiLSTM → Attention → Transformer
              </span>
            </div>
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
            {backendMode === "local" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 flex items-center justify-center gap-2">
                <div className="bg-muted border border-border rounded-lg px-4 py-2 flex items-center gap-2">
                  <Server className="w-4 h-4 text-primary" />
                  <span className="font-mono text-xs text-muted-foreground">
                    Local DL Backend: 
                  </span>
                  <input
                    type="text"
                    value={localBackendUrl}
                    onChange={(e) => setLocalBackendUrl(e.target.value)}
                    className="bg-transparent border-b border-primary/30 text-xs font-mono text-foreground px-1 py-0.5 w-48 focus:outline-none focus:border-primary"
                  />
                </div>
              </motion.div>
            )}
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
                <div className="flex items-center gap-2">
                  {backendMode === "local" ? (
                    <Server className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <Cloud className="w-3.5 h-3.5 text-primary" />
                  )}
                  <span className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">
                    {videoName}
                  </span>
                </div>
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
                      <Label htmlFor="show-frames" className="text-xs text-muted-foreground">Frames</Label>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Pipeline Logs — shows backend console output */}
            {pipelineLogs.length > 0 && (
              <PipelineLogs logs={pipelineLogs} isProcessing={isProcessing} />
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
