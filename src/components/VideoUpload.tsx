import React from "react";
import { motion } from "framer-motion";
import { Upload, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VideoUploadProps {
  onFileSelect: (file: File) => void;
  isProcessing: boolean;
}

const VideoUpload: React.FC<VideoUploadProps> = ({ onFileSelect, isProcessing }) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative border-2 border-dashed rounded-lg p-12 text-center transition-all duration-300 ${
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
          className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4"
        >
          {dragOver ? (
            <Video className="w-8 h-8 text-primary" />
          ) : (
            <Upload className="w-8 h-8 text-primary" />
          )}
        </motion.div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Upload Surveillance Video
        </h3>
        <p className="text-muted-foreground text-sm mb-6">
          Drag & drop a video file or click to browse. No audio required.
        </p>
        <Button
          variant="cyber"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
        >
          Select Video File
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </motion.div>
  );
};

export default VideoUpload;
