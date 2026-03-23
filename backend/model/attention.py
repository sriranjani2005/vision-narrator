"""
============================================================
Attention Mechanism — Multi-Head & Temporal Attention
============================================================
Implements attention mechanisms to weigh the importance of
different frames and temporal features for caption generation.

Components:
  1. Multi-Head Self-Attention (4 heads)
  2. Temporal Attention Pooling (soft attention over frames)
  3. Context Vector Generation

Architecture:
  Input: Temporal Features (num_frames, 512)
  → Multi-Head Self-Attention (4 heads, dk=128)
  → Temporal Attention Weights (softmax over frames)
  → Context Vector (weighted sum)
  → Output: Context Vector (512-dim) + Attention Weights
============================================================
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import logging

logger = logging.getLogger(__name__)


class MultiHeadAttention(nn.Module):
    """
    Multi-Head Self-Attention mechanism.
    
    Allows the model to jointly attend to information from
    different representation subspaces at different positions.
    """

    def __init__(self, embed_dim: int = 512, num_heads: int = 4, dropout: float = 0.1):
        super(MultiHeadAttention, self).__init__()
        
        assert embed_dim % num_heads == 0, "embed_dim must be divisible by num_heads"
        
        self.embed_dim = embed_dim
        self.num_heads = num_heads
        self.head_dim = embed_dim // num_heads  # 128 per head
        self.scale = self.head_dim ** -0.5      # Scaling factor
        
        # Linear projections for Q, K, V
        self.W_q = nn.Linear(embed_dim, embed_dim)
        self.W_k = nn.Linear(embed_dim, embed_dim)
        self.W_v = nn.Linear(embed_dim, embed_dim)
        
        # Output projection
        self.W_o = nn.Linear(embed_dim, embed_dim)
        
        self.dropout = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor) -> tuple:
        """
        Args:
            x: Input tensor (batch_size, seq_len, embed_dim)
            
        Returns:
            tuple: (output, attention_weights)
        """
        B, T, D = x.shape
        
        # Compute Q, K, V projections
        Q = self.W_q(x).view(B, T, self.num_heads, self.head_dim).transpose(1, 2)
        K = self.W_k(x).view(B, T, self.num_heads, self.head_dim).transpose(1, 2)
        V = self.W_v(x).view(B, T, self.num_heads, self.head_dim).transpose(1, 2)
        # Each: (B, num_heads, T, head_dim)
        
        # Scaled dot-product attention
        scores = torch.matmul(Q, K.transpose(-2, -1)) * self.scale  # (B, H, T, T)
        attention_weights = F.softmax(scores, dim=-1)
        attention_weights = self.dropout(attention_weights)
        
        # Weighted sum of values
        attended = torch.matmul(attention_weights, V)  # (B, H, T, head_dim)
        
        # Concatenate heads and project
        attended = attended.transpose(1, 2).contiguous().view(B, T, D)
        output = self.W_o(attended)
        
        return output, attention_weights


class TemporalAttentionPooling(nn.Module):
    """
    Soft attention over temporal dimension.
    
    Learns to assign importance weights to each frame,
    producing a single context vector as a weighted sum.
    """

    def __init__(self, feature_dim: int = 512, attention_dim: int = 128):
        super(TemporalAttentionPooling, self).__init__()
        
        # Attention scoring network
        self.attention_net = nn.Sequential(
            nn.Linear(feature_dim, attention_dim),
            nn.Tanh(),
            nn.Linear(attention_dim, 1),
        )

    def forward(self, features: torch.Tensor) -> tuple:
        """
        Args:
            features: (batch_size, num_frames, feature_dim)
            
        Returns:
            tuple: (context_vector, attention_weights)
                - context_vector: (batch_size, feature_dim)
                - attention_weights: (batch_size, num_frames)
        """
        # Compute attention scores for each frame
        scores = self.attention_net(features).squeeze(-1)  # (B, T)
        attention_weights = F.softmax(scores, dim=-1)      # (B, T)
        
        # Weighted sum to produce context vector
        context = torch.bmm(
            attention_weights.unsqueeze(1),  # (B, 1, T)
            features                          # (B, T, D)
        ).squeeze(1)                          # (B, D)
        
        return context, attention_weights


class AttentionMechanism(nn.Module):
    """
    Combined Attention Module for HAVCM.
    
    Applies multi-head self-attention followed by temporal
    attention pooling to produce frame-level attention weights
    and a global context vector.
    """

    def __init__(
        self,
        feature_dim: int = 512,
        num_heads: int = 4,
        attention_dim: int = 128,
        dropout: float = 0.1,
    ):
        super(AttentionMechanism, self).__init__()
        
        logger.info("Initializing Attention Mechanism...")
        
        # Multi-head self-attention
        self.self_attention = MultiHeadAttention(
            embed_dim=feature_dim,
            num_heads=num_heads,
            dropout=dropout,
        )
        
        # Temporal attention pooling
        self.temporal_attention = TemporalAttentionPooling(
            feature_dim=feature_dim,
            attention_dim=attention_dim,
        )
        
        # Layer normalization
        self.layer_norm = nn.LayerNorm(feature_dim)
        
        self.output_dim = feature_dim
        
        logger.info(f"  ✓ Multi-Head Attention: {num_heads} heads, dk={feature_dim // num_heads}")
        logger.info(f"  ✓ Temporal Pooling: attention_dim={attention_dim}")

    def forward(self, temporal_features: torch.Tensor) -> dict:
        """
        Apply attention mechanism to BiLSTM temporal features.
        
        Args:
            temporal_features: (batch_size, num_frames, 512)
            
        Returns:
            dict with:
                - attended_features: (batch_size, num_frames, 512)
                - context_vector: (batch_size, 512)
                - self_attention_weights: (batch_size, num_heads, T, T)
                - temporal_attention_weights: (batch_size, num_frames)
        """
        logger.info(f"  → Attention forward: input shape {temporal_features.shape}")
        
        # Step 1: Multi-head self-attention (frame-to-frame relationships)
        attended, self_attn_weights = self.self_attention(temporal_features)
        attended = self.layer_norm(attended + temporal_features)  # Residual connection
        logger.info(f"  → Self-attention output: {attended.shape}")
        
        # Step 2: Temporal attention pooling (frame importance weights)
        context_vector, temporal_weights = self.temporal_attention(attended)
        logger.info(f"  → Context vector: {context_vector.shape}")
        logger.info(f"  → Attention weights: {temporal_weights.shape}")
        
        # Log frame importance scores
        weights_list = temporal_weights.squeeze(0).tolist()
        if isinstance(weights_list, list):
            for i, w in enumerate(weights_list):
                logger.info(f"    Frame {i+1} attention weight: {w:.4f}")
        
        return {
            "attended_features": attended,
            "context_vector": context_vector,
            "self_attention_weights": self_attn_weights,
            "temporal_attention_weights": temporal_weights,
        }
