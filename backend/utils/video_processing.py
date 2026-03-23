"""
============================================================
Video Processing Utilities
============================================================
Handles video frame extraction using OpenCV with uniform
temporal sampling and preprocessing for the CNN backbone.

Pipeline:
  Video File → OpenCV VideoCapture → Uniform Sampling
  → Frame Extraction → Resize (224x224) → PIL Images
  → Ready for CNN Feature Extraction
============================================================
"""

import cv2
import numpy as np
from PIL import Image
import tempfile
import os
import logging
from typing import List, Tuple

logger = logging.getLogger(__name__)


class VideoProcessor:
    """
    Video frame extraction and preprocessing utility.
    
    Extracts uniformly-spaced frames from video files using
    OpenCV and prepares them for the CNN feature extractor.
    """

    def __init__(self, target_size: Tuple[int, int] = (224, 224)):
        """
        Args:
            target_size: Output frame size (width, height) for CNN input
        """
        self.target_size = target_size
        logger.info(f"VideoProcessor initialized (target_size={target_size})")

    def extract_frames(
        self,
        video_path: str,
        num_frames: int = 8,
    ) -> List[dict]:
        """
        Extract uniformly-spaced frames from a video file.
        
        Uses temporal uniform sampling to select frames that
        represent the video content evenly across its duration.
        
        Args:
            video_path: Path to the video file
            num_frames: Number of frames to extract (default: 8)
            
        Returns:
            List of dicts with:
                - 'image': PIL Image (224x224, RGB)
                - 'timestamp': float (seconds)
                - 'time_label': str (MM:SS format)
                - 'frame_index': int (original frame number)
        """
        logger.info(f"Extracting {num_frames} frames from: {video_path}")
        
        # Open video with OpenCV
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Cannot open video file: {video_path}")
        
        # Get video properties
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        duration = total_frames / fps if fps > 0 else 0
        
        logger.info(f"  Video properties:")
        logger.info(f"    Total frames: {total_frames}")
        logger.info(f"    FPS: {fps:.2f}")
        logger.info(f"    Duration: {duration:.2f}s")
        logger.info(f"    Resolution: {int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}")
        
        # Calculate uniform frame indices
        interval = total_frames / (num_frames + 1)
        frame_indices = [int(interval * (i + 1)) for i in range(num_frames)]
        
        logger.info(f"  Sampling frame indices: {frame_indices}")
        
        extracted_frames = []
        
        for idx, frame_idx in enumerate(frame_indices):
            # Seek to frame position
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            ret, frame = cap.read()
            
            if not ret:
                logger.warning(f"  ✗ Failed to read frame at index {frame_idx}")
                continue
            
            # Convert BGR (OpenCV) → RGB (PIL)
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Resize to target size for CNN input
            frame_resized = cv2.resize(frame_rgb, self.target_size)
            
            # Convert to PIL Image
            pil_image = Image.fromarray(frame_resized)
            
            # Calculate timestamp
            timestamp = frame_idx / fps if fps > 0 else 0
            minutes = int(timestamp // 60)
            seconds = int(timestamp % 60)
            time_label = f"{minutes:02d}:{seconds:02d}"
            
            extracted_frames.append({
                "image": pil_image,
                "timestamp": round(timestamp, 2),
                "time_label": time_label,
                "frame_index": frame_idx,
            })
            
            logger.info(f"  ✓ Frame {idx+1}/{num_frames} extracted at {time_label} (index={frame_idx})")
        
        cap.release()
        logger.info(f"  ✓ Total frames extracted: {len(extracted_frames)}")
        
        return extracted_frames

    def save_temp_video(self, video_bytes: bytes) -> str:
        """
        Save uploaded video bytes to a temporary file.
        
        Args:
            video_bytes: Raw video file bytes
            
        Returns:
            Path to the temporary video file
        """
        temp_file = tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".mp4",
            prefix="havcm_",
        )
        temp_file.write(video_bytes)
        temp_file.close()
        
        logger.info(f"  Saved temp video: {temp_file.name} ({len(video_bytes)} bytes)")
        return temp_file.name

    def cleanup(self, video_path: str):
        """Remove temporary video file."""
        try:
            if os.path.exists(video_path):
                os.remove(video_path)
                logger.info(f"  Cleaned up: {video_path}")
        except Exception as e:
            logger.warning(f"  Cleanup failed: {e}")
