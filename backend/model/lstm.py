"""
============================================================
Bidirectional LSTM — Temporal Sequence Encoder
============================================================
Processes the sequence of CNN frame features to capture 
temporal dependencies across video frames.

Uses a 2-layer Bidirectional LSTM to model both forward 
and backward temporal context.

Architecture:
  Input: Frame Features (num_frames, 1280)
  → Linear Projection (1280 → 512)
  → 2-Layer Bidirectional LSTM (hidden=256, output=512)
  → Layer Normalization
  → Output: Temporal Features (num_frames, 512)
============================================================
"""

import torch
import torch.nn as nn
import logging

logger = logging.getLogger(__name__)


class BiLSTMTemporalEncoder(nn.Module):
    """
    2-Layer Bidirectional LSTM for temporal modeling.
    
    Captures both forward (past → future) and backward (future → past)
    temporal dependencies across the frame sequence.
    
    Parameters:
        input_dim:  CNN feature dimension (default: 1280)
        hidden_dim: LSTM hidden state size (default: 256)
        num_layers: Number of LSTM layers (default: 2)
        dropout:    Dropout rate between layers (default: 0.3)
    """

    def __init__(
        self,
        input_dim: int = 1280,
        hidden_dim: int = 256,
        num_layers: int = 2,
        dropout: float = 0.3,
    ):
        super(BiLSTMTemporalEncoder, self).__init__()
        
        logger.info("Initializing BiLSTM Temporal Encoder...")
        
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        
        # Project CNN features to LSTM input dimension
        self.input_projection = nn.Linear(input_dim, hidden_dim * 2)
        
        # Bidirectional LSTM — 2 layers with dropout
        self.bilstm = nn.LSTM(
            input_size=hidden_dim * 2,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            bidirectional=True,      # Forward + Backward
            dropout=dropout if num_layers > 1 else 0,
        )
        
        # Layer normalization for stable training
        self.layer_norm = nn.LayerNorm(hidden_dim * 2)
        
        # Output dimension (bidirectional doubles the hidden dim)
        self.output_dim = hidden_dim * 2  # 512
        
        logger.info(f"  ✓ BiLSTM: {num_layers} layers, hidden={hidden_dim}")
        logger.info(f"  ✓ Bidirectional: output_dim={self.output_dim}")
        logger.info(f"  ✓ Dropout: {dropout}")

    def forward(self, features: torch.Tensor) -> tuple:
        """
        Encode temporal dependencies across frame features.
        
        Args:
            features: CNN features (batch_size, num_frames, 1280)
            
        Returns:
            tuple: (temporal_features, hidden_state)
                - temporal_features: (batch_size, num_frames, 512)
                - hidden_state: (h_n, c_n) for decoder initialization
        """
        logger.info(f"  → BiLSTM forward pass: input shape {features.shape}")
        
        # Project input features
        projected = self.input_projection(features)  # (B, T, 512)
        logger.info(f"  → After projection: {projected.shape}")
        
        # Run through BiLSTM
        lstm_out, (h_n, c_n) = self.bilstm(projected)
        # lstm_out: (B, T, 512) — concatenated forward & backward
        
        # Apply layer normalization
        temporal_features = self.layer_norm(lstm_out)
        
        logger.info(f"  → BiLSTM output: {temporal_features.shape}")
        logger.info(f"  → Hidden state: h_n={h_n.shape}, c_n={c_n.shape}")
        
        return temporal_features, (h_n, c_n)

    def get_sequence_representation(self, features: torch.Tensor) -> torch.Tensor:
        """
        Get a single vector representing the entire sequence.
        Uses mean pooling over temporal dimension.
        
        Args:
            features: CNN features (batch_size, num_frames, 1280)
            
        Returns:
            Sequence vector (batch_size, 512)
        """
        temporal_features, _ = self.forward(features)
        return temporal_features.mean(dim=1)  # Mean pooling
