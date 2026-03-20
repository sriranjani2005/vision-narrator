export interface ExtractedFrame {
  timestamp: number;
  timeLabel: string;
  dataUrl: string;
  blob: Blob;
}

export async function extractFrames(
  videoFile: File,
  numFrames: number = 8,
  onProgress?: (progress: number) => void
): Promise<ExtractedFrame[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    const url = URL.createObjectURL(videoFile);
    video.src = url;

    video.onloadedmetadata = async () => {
      const duration = video.duration;
      if (!duration || duration === Infinity) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not determine video duration"));
        return;
      }

      const canvas = document.createElement("canvas");
      // Higher resolution for better AI accuracy
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d")!;

      const frames: ExtractedFrame[] = [];
      const interval = duration / (numFrames + 1);

      for (let i = 1; i <= numFrames; i++) {
        const time = interval * i;
        onProgress?.((i / numFrames) * 100);

        try {
          const frame = await captureFrame(video, ctx, canvas, time);
          frames.push(frame);
        } catch {
          // Skip frames that fail
        }
      }

      URL.revokeObjectURL(url);
      resolve(frames);
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load video"));
    };
  });
}

function captureFrame(
  video: HTMLVideoElement,
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  time: number
): Promise<ExtractedFrame> {
  return new Promise((resolve, reject) => {
    video.currentTime = time;
    video.onseeked = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to capture frame"));
            return;
          }
          const minutes = Math.floor(time / 60);
          const seconds = Math.floor(time % 60);
          const timeLabel = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

          resolve({
            timestamp: time,
            timeLabel,
            dataUrl: canvas.toDataURL("image/jpeg", 0.85),
            blob,
          });
        },
        "image/jpeg",
        0.85
      );
    };
    video.onerror = () => reject(new Error("Seek failed"));
  });
}

export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
