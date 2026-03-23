"""
============================================================
CNN Feature Extractor — EfficientNet-B0 Backbone
============================================================
Extracts spatial feature vectors from individual video frames.
Uses pretrained EfficientNet-B0 (ImageNet) with the 
classification head removed to produce 1280-dim feature vectors.

Architecture:
  Input: RGB Frame (3 x 224 x 224)
  → EfficientNet-B0 Backbone (pretrained on ImageNet)
  → Adaptive Average Pooling
  → Output: Feature Vector (1280-dim)
============================================================
"""

import torch
import torch.nn as nn
import torchvision.models as models
import torchvision.transforms as transforms
import logging

logger = logging.getLogger(__name__)


class CNNFeatureExtractor(nn.Module):
    """
    EfficientNet-B0 based spatial feature extractor.
    
    Removes the final classification layer and uses the backbone
    to extract rich spatial features from each video frame.
    
    Output dimension: 1280 (EfficientNet-B0 feature size)
    """

    def __init__(self, pretrained: bool = True):
        super(CNNFeatureExtractor, self).__init__()
        
        logger.info("Initializing EfficientNet-B0 CNN Feature Extractor...")
        
        # Load pretrained EfficientNet-B0
        weights = models.EfficientNet_B0_Weights.IMAGENET1K_V1 if pretrained else None
        efficientnet = models.efficientnet_b0(weights=weights)
        
        # Remove classification head — keep only feature extraction layers
        self.backbone = nn.Sequential(*list(efficientnet.children())[:-2])
        
        # Adaptive pooling to get fixed-size output
        self.pool = nn.AdaptiveAvgPool2d((1, 1))
        
        # Output feature dimension
        self.feature_dim = 1280
        
        # Image preprocessing pipeline (ImageNet normalization)
        self.preprocess = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],  # ImageNet means
                std=[0.229, 0.224, 0.225]     # ImageNet stds
            ),
        ])
        
        # Freeze backbone for inference (no fine-tuning needed)
        for param in self.backbone.parameters():
            param.requires_grad = False
            
        logger.info(f"  ✓ EfficientNet-B0 loaded (feature_dim={self.feature_dim})")
        logger.info(f"  ✓ Pretrained weights: {'ImageNet' if pretrained else 'None'}")

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Extract spatial features from a batch of frames.
        
        Args:
            x: Input tensor of shape (batch_size, 3, 224, 224)
            
        Returns:
            Feature tensor of shape (batch_size, 1280)
        """
        logger.info(f"  → CNN forward pass: input shape {x.shape}")
        
        # Pass through EfficientNet backbone
        features = self.backbone(x)           # (B, 1280, 7, 7)
        
        # Global average pooling
        features = self.pool(features)         # (B, 1280, 1, 1)
        features = features.flatten(1)         # (B, 1280)
        
        logger.info(f"  → CNN output: feature shape {features.shape}")
        return features

    def extract_from_frames(self, frames: list) -> torch.Tensor:
        """
        Extract features from a list of PIL Images.
        
        Args:
            frames: List of PIL Image objects
            
        Returns:
            Feature tensor of shape (num_frames, 1280)
        """
        logger.info(f"Running CNN feature extraction on {len(frames)} frames...")
        
        # Preprocess all frames
        tensors = [self.preprocess(frame) for frame in frames]
        batch = torch.stack(tensors)  # (N, 3, 224, 224)
        
        # Extract features
        with torch.no_grad():
            features = self.forward(batch)
            
        logger.info(f"  ✓ CNN features extracted: {features.shape}")
        return features
