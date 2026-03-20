import React from "react";
import { motion } from "framer-motion";
import { Upload, Video, Link, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface VideoUploadProps {
  onFileSelect: (file: File) => void;
  onYouTubeSubmit: (url: string) => void;
  isProcessing: boolean;
  frameCount: number;
  onFrameCountChange: (count: number) => void;
}

const VideoUpload: React.FC<VideoUploadProps> = ({
  onFileSelect,
  onYouTubeSubmit,
  isProcessing,
  frameCount,
  onFrameCountChange,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [youtubeUrl, setYoutubeUrl] = React.useState("");

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("video/")) {
      onFileSelect(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
  };

  const handleYouTubeSubmit = () => {
    const trimmed = youtubeUrl.trim();
    if (trimmed && (trimmed.includes("youtube.com") || trimmed.includes("youtu.be"))) {
      onYouTubeSubmit(trimmed);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Frame count slider */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-mono text-muted-foreground">FRAMES TO EXTRACT</Label>
          <span className="font-mono text-sm font-bold text-primary">{frameCount}</span>
        </div>
        <Slider
          value={[frameCount]}
          onValueChange={([v]) => onFrameCountChange(v)}
          min={4}
          max={24}
          step={2}
          disabled={isProcessing}
        />
        <p className="text-xs text-muted-foreground">More frames = more detail but slower processing</p>
      </div>

      <Tabs defaultValue="file" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="file">Upload File</TabsTrigger>
          <TabsTrigger value="youtube">YouTube Link</TabsTrigger>
        </TabsList>

        <TabsContent value="file">
          <div
            className={`relative border-2 border-dashed rounded-lg p-10 text-center transition-all duration-300 ${
              dragOver ? "border-primary glow-border bg-primary/5" : "border-border hover:border-primary/50"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <div className="scan-line absolute inset-0 rounded-lg pointer-events-none opacity-30" />
            <div className="relative z-10">
              <motion.div
                animate={{ scale: dragOver ? 1.1 : 1 }}
                className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3"
              >
                {dragOver ? <Video className="w-7 h-7 text-primary" /> : <Upload className="w-7 h-7 text-primary" />}
              </motion.div>
              <h3 className="text-base font-semibold text-foreground mb-1">Upload Video</h3>
              <p className="text-muted-foreground text-xs mb-4">Drag & drop or click to browse</p>
              <Button
                variant="cyber"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
              >
                {isProcessing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</> : "Select File"}
              </Button>
              <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileChange} className="hidden" />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="youtube">
          <div className="border-2 border-dashed border-border rounded-lg p-10 text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Link className="w-7 h-7 text-primary" />
            </div>
            <h3 className="text-base font-semibold text-foreground">YouTube Link</h3>
            <p className="text-muted-foreground text-xs">Paste a YouTube video URL to analyze</p>
            <div className="flex gap-2">
              <Input
                placeholder="https://www.youtube.com/watch?v=..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                disabled={isProcessing}
              />
              <Button
                variant="cyber"
                size="sm"
                onClick={handleYouTubeSubmit}
                disabled={isProcessing || !youtubeUrl.trim()}
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Analyze"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground/60">
              Note: YouTube video will be fetched and frames extracted server-side
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default VideoUpload;
