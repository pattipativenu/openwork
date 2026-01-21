# PyTorch and Transformers Usage

---

## PYTORCH & TRANSFORMERS: DETAILED IMPLEMENTATION

### Why PyTorch + Transformers for BGE Re-Ranker?

**PyTorch** is the deep learning framework that powers the BGE re-ranker model. **Transformers** (HuggingFace library) provides the pre-trained model architecture and easy loading/inference capabilities.

### Complete Installation & Setup

```bash
# Core dependencies
pip install torch==2.1.0  # PyTorch CPU version (lighter)
# OR for GPU support:
# pip install torch==2.1.0+cu118 -f https://download.pytorch.org/whl/torch_stable.html

# Transformers library (HuggingFace)
pip install transformers==4.35.2

# Additional dependencies
pip install sentencepiece  # For tokenization
pip install accelerate     # For optimized model loading
pip install safetensors    # For faster model loading
```

### Model Architecture Deep Dive

```python
from transformers import AutoModelForSequenceClassification, AutoTokenizer
import torch
import torch.nn.functional as F

class BGERerankerDetailed:
    """
    Detailed implementation of BGE re-ranker with PyTorch/Transformers
    """
    
    def __init__(self, model_name: str = "BAAI/bge-reranker-v2-m3",
                 device: str = None):
        """
        Initialize BGE re-ranker
        
        Args:
            model_name: HuggingFace model identifier
            device: 'cuda', 'cpu', or None (auto-detect)
        """
        
        # Device selection (auto-detect if not specified)
        if device is None:
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            self.device = device
        
        print(f"🚀 Loading BGE Re-Ranker on {self.device.upper()}")
        
        # Load tokenizer
        # Tokenizer converts text → token IDs that model understands
        self.tokenizer = AutoTokenizer.from_pretrained(
            model_name,
            cache_dir="./model_cache",  # Cache for faster loading
            use_fast=True  # Use Rust-based fast tokenizer
        )
        
        # Load model
        # AutoModelForSequenceClassification: Pre-built architecture for
        # binary/multi-class classification (in this case: relevance scoring)
        self.model = AutoModelForSequenceClassification.from_pretrained(
            model_name,
            cache_dir="./model_cache",
            torch_dtype=torch.float32 if self.device == "cpu" else torch.float16,
            # float16 for GPU (faster, less memory), float32 for CPU (more stable)
        )
        
        # Move model to device
        self.model.to(self.device)
        
        # Set to evaluation mode (disables dropout, batch norm in training mode)
        self.model.eval()
        
        # Get model config for understanding architecture
        self.config = self.model.config
        
        print(f"✅ Model loaded: {self.config.num_hidden_layers} layers, "
              f"{self.config.hidden_size} hidden size, "
              f"{self.config.num_attention_heads} attention heads")
        
        # Batch size based on device
        self.batch_size = 128 if self.device == "cuda" else 32
        
    def explain_architecture(self):
        """
        Explain what's happening under the hood
        """
        print("\n📊 BGE Re-Ranker Architecture:")
        print("=" * 60)
        print(f"Base Model: {self.config.model_type}")
        print(f"Total Parameters: {sum(p.numel() for p in self.model.parameters()):,}")
        print(f"Trainable Parameters: {sum(p.numel() for p in self.model.parameters() if p.requires_grad):,}")
        print(f"Max Sequence Length: {self.config.max_position_embeddings}")
        print(f"Vocabulary Size: {self.config.vocab_size}")
        print("\nModel Layers:")
        for name, module in self.model.named_children():
            print(f"  - {name}: {module.__class__.__name__}")
        print("=" * 60)
        
    def tokenize_pairs(self, query: str, documents: List[str]) -> Dict:
        """
        Convert query-document pairs to model inputs using Transformers tokenizer
        
        How tokenization works:
        1. Text → WordPiece tokens (subword units)
        2. Tokens → Token IDs (integers from vocabulary)
        3. Add special tokens: [CLS] query [SEP] document [SEP]
        4. Create attention mask (1 for real tokens, 0 for padding)
        5. Create token type IDs (0 for query, 1 for document)
        
        Args:
            query: User query string
            documents: List of document strings
        
        Returns:
            Dictionary with input_ids, attention_mask, token_type_ids (all as PyTorch tensors)
        """
        
        # Create pairs: [[query, doc1], [query, doc2], ...]
        pairs = [[query, doc] for doc in documents]
        
        # Tokenize all pairs in batch
        # This is where Transformers library does heavy lifting
        encoded = self.tokenizer(
            pairs,
            padding=True,           # Pad shorter sequences to match longest in batch
            truncation=True,        # Truncate sequences longer than max_length
            max_length=512,         # BGE-reranker-v2-m3 max input length
            return_tensors='pt',    # Return PyTorch tensors (not lists)
            return_attention_mask=True,
            return_token_type_ids=True
        )
        
        # Example of what encoded contains:
        # {
        #   'input_ids': tensor([[101, 2023, 2003, ..., 102, 0, 0],    # [CLS] query [SEP] doc [SEP] [PAD] [PAD]
        #                        [101, 2023, 2003, ..., 102, 0, 0]]),  # Token IDs
        #   'attention_mask': tensor([[1, 1, 1, ..., 1, 0, 0],         # 1=real token, 0=padding
        #                             [1, 1, 1, ..., 1, 0, 0]]),
        #   'token_type_ids': tensor([[0, 0, 0, ..., 1, 1, 1],         # 0=query, 1=document
        #                             [0, 0, 0, ..., 1, 1, 1]])
        # }
        
        return encoded
    
    def forward_pass(self, inputs: Dict) -> torch.Tensor:
        """
        Run forward pass through the model (PyTorch computation graph)
        
        What happens in forward pass:
        1. Embedding Layer: Token IDs → Dense vectors (768-dim)
        2. Transformer Layers (12x):
           - Multi-head self-attention (queries attend to documents)
           - Feed-forward network
           - Layer normalization
           - Residual connections
        3. Pooling: [CLS] token representation (captures query-doc relationship)
        4. Classification Head: 768-dim → 1-dim (relevance score logit)
        
        Args:
            inputs: Dictionary with input_ids, attention_mask, token_type_ids
        
        Returns:
            Logits tensor (raw scores before normalization)
        """
        
        # Move inputs to device (GPU or CPU)
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        
        # Disable gradient computation (we're doing inference, not training)
        with torch.no_grad():
            # This is where PyTorch magic happens
            # Model automatically:
            # 1. Passes inputs through all layers
            # 2. Computes attention weights
            # 3. Returns final logits
            outputs = self.model(**inputs)
            
            # outputs.logits shape: (batch_size, num_labels)
            # For binary classification (relevant/not): (batch_size, 1)
            logits = outputs.logits.squeeze(-1)  # Remove last dimension
        
        return logits
    
    def score_batch(self, query: str, documents: List[str]) -> List[float]:
        """
        Score a batch of documents against query
        
        Complete pipeline:
        Text → Tokenization → Forward Pass → Normalization → Scores
        
        Args:
            query: Search query
            documents: List of documents to score
        
        Returns:
            List of relevance scores (0-1 range)
        """
        
        # Step 1: Tokenization (Transformers library)
        inputs = self.tokenize_pairs(query, documents)
        
        # Step 2: Forward pass (PyTorch)
        logits = self.forward_pass(inputs)
        
        # Step 3: Normalization (PyTorch)
        # Convert logits to probabilities using sigmoid
        # sigmoid(x) = 1 / (1 + e^(-x))
        # Maps (-∞, +∞) → (0, 1)
        scores = torch.sigmoid(logits)
        
        # Step 4: Convert to Python list
        scores_list = scores.cpu().tolist()  # Move to CPU if on GPU, convert to list
        
        return scores_list
    
    def rank_documents(self, query: str, documents: List[str],
                      return_scores: bool = True) -> List[Dict]:
        """
        Full re-ranking pipeline with batch processing
        
        Handles large document lists by processing in batches
        to avoid GPU/CPU memory overflow
        
        Args:
            query: Search query
            documents: List of documents to rank
            return_scores: Whether to include scores in output
        
        Returns:
            List of dicts with document index, text, and score (sorted by relevance)
        """
        
        all_scores = []
        
        # Process in batches to manage memory
        for i in range(0, len(documents), self.batch_size):
            batch_docs = documents[i:i + self.batch_size]
            
            # Score this batch
            batch_scores = self.score_batch(query, batch_docs)
            all_scores.extend(batch_scores)
            
            # Optional: Clear GPU cache after each batch
            if self.device == "cuda":
                torch.cuda.empty_cache()
        
        # Create ranked results
        results = [
            {
                'index': idx,
                'text': doc,
                'score': score
            }
            for idx, (doc, score) in enumerate(zip(documents, all_scores))
        ]
        
        # Sort by score (descending)
        results.sort(key=lambda x: x['score'], reverse=True)
        
        return results

    def optimize_for_inference(self):
        """
        Apply PyTorch optimizations for faster inference
        """
        
        # 1. Enable TorchScript (JIT compilation for faster execution)
        if self.device == "cuda":
            # Compile model to optimized format
            self.model = torch.jit.trace(
                self.model,
                example_inputs=self._get_example_inputs()
            )
        
        # 2. Enable PyTorch inference mode (more aggressive optimizations)
        # Use in production:
        # with torch.inference_mode():
        #     scores = self.score_batch(query, docs)
        
        # 3. For CPU: Enable oneDNN optimizations
        if self.device == "cpu":
            torch.set_num_threads(4)  # Use 4 CPU cores
            # Enable oneDNN (Intel's optimized ops)
            try:
                import intel_extension_for_pytorch as ipex
                self.model = ipex.optimize(self.model)
                print("✅ Intel oneDNN optimizations enabled")
            except ImportError:
                print("⚠️  Intel extension not available, using default CPU backend")
        
        # 4. For GPU: Enable TensorFloat-32 (faster matrix multiplies on Ampere+ GPUs)
        if self.device == "cuda":
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True
            print("✅ TensorFloat-32 optimizations enabled")
    
    def get_model_memory_usage(self) -> Dict:
        """
        Get memory statistics (useful for debugging)
        """
        
        # Model size
        model_size_mb = sum(
            p.numel() * p.element_size() for p in self.model.parameters()
        ) / (1024 ** 2)
        
        stats = {
            'model_size_mb': model_size_mb,
            'device': self.device
        }
        
        # GPU memory stats
        if self.device == "cuda":
            stats['gpu_allocated_mb'] = torch.cuda.memory_allocated() / (1024 ** 2)
            stats['gpu_reserved_mb'] = torch.cuda.memory_reserved() / (1024 ** 2)
            stats['gpu_max_allocated_mb'] = torch.cuda.max_memory_allocated() / (1024 ** 2)
        
        return stats
```

### Usage Example in Open Work

```python
# Initialize re-ranker (happens once at startup)
reranker = BGERerankerDetailed(device="cpu")  # or "cuda" if GPU available
reranker.explain_architecture()
reranker.optimize_for_inference()

# In Agent 4 (Two-Stage Re-Ranking)
class TwoStageReranker:
    def __init__(self):
        self.reranker = BGERerankerDetailed()
        
    async def stage1_document_reranking(self, query: str, 
                                       candidates: List[EvidenceCandidate]) -> List[Tuple]:
        """
        Stage 1: Re-rank 100+ documents using abstracts
        """
        
        # Prepare document texts
        doc_texts = []
        for candidate in candidates:
            # Format: Title + Abstract (first 1500 chars)
            text = f"Title: {candidate.title}\n\n{candidate.text[:1500]}"
            doc_texts.append(text)
        
        # Score all documents using BGE
        # This uses PyTorch + Transformers under the hood
        ranked_results = self.reranker.rank_documents(
            query=query,
            documents=doc_texts,
            return_scores=True
        )
        
        # Map back to original candidates
        ranked_candidates = []
        for result in ranked_results:
            original_candidate = candidates[result['index']]
            ranked_candidates.append((original_candidate, result['score']))
        
        # Return top 20
        return ranked_candidates[:20]
    
    async def stage2_chunk_reranking(self, query: str,
                                    chunks: List[Dict]) -> List[Tuple]:
        """
        Stage 2: Re-rank ~100 chunks from top 20 documents
        """
        
        # Prepare chunk texts
        chunk_texts = [
            f"Title: {chunk['title']}\nSection: {chunk.get('section', 'N/A')}\n\n{chunk['text']}"
            for chunk in chunks
        ]
        
        # Score all chunks
        ranked_results = self.reranker.rank_documents(
            query=query,
            documents=chunk_texts,
            return_scores=True
        )
        
        # Map back to original chunks
        ranked_chunks = []
        for result in ranked_results:
            original_chunk = chunks[result['index']]
            ranked_chunks.append((original_chunk, result['score']))
        
        return ranked_chunks
```

### Performance Benchmarks

```python
import time

def benchmark_reranker():
    """
    Benchmark re-ranker performance
    """
    
    reranker = BGERerankerDetailed()
    
    # Test query
    query = "apixaban versus rivaroxaban in atrial fibrillation with chronic kidney disease"
    
    # Generate dummy documents
    documents = [
        f"This is a medical document about treatment options for condition {i}. "
        f"It discusses various therapeutic approaches and clinical outcomes. "
        * 10  # Make it realistic length (~100 words)
        for i in range(100)
    ]
    
    # Benchmark
    print("\n🔬 Benchmarking Re-Ranker Performance")
    print("=" * 60)
    
    # Warm-up (first run loads model to GPU cache)
    _ = reranker.score_batch(query, documents[:10])
    
    # Actual benchmark
    start = time.time()
    results = reranker.rank_documents(query, documents)
    end = time.time()
    
    latency_ms = (end - start) * 1000
    throughput = len(documents) / (end - start)
    
    print(f"Documents: {len(documents)}")
    print(f"Latency: {latency_ms:.1f}ms")
    print(f"Throughput: {throughput:.1f} docs/sec")
    print(f"Per-document: {latency_ms / len(documents):.2f}ms")
    
    # Memory usage
    mem_stats = reranker.get_model_memory_usage()
    print(f"\nMemory Usage:")
    print(f"  Model Size: {mem_stats['model_size_mb']:.1f} MB")
    if 'gpu_allocated_mb' in mem_stats:
        print(f"  GPU Allocated: {mem_stats['gpu_allocated_mb']:.1f} MB")
    
    print("=" * 60)

# Run benchmark
benchmark_reranker()
```

**Expected Performance**:

```
CPU (4 cores):
- 100 documents: ~3-4 seconds
- Throughput: ~25-30 docs/sec
- Memory: ~400 MB

GPU (NVIDIA T4):
- 100 documents: ~0.8-1.2 seconds  
- Throughput: ~80-120 docs/sec
- Memory: ~800 MB (model) + ~200 MB (computation)
```

### Key PyTorch/Transformers Concepts Used

1. **Automatic Differentiation** (not used in inference, but model was trained with it)
2. **Tensor Operations** - All computation on multi-dimensional arrays
3. **GPU Acceleration** - CUDA backend for parallel computation
4. **Tokenization** - Text → Subword tokens via Transformers
5. **Attention Mechanism** - Core of Transformer architecture
6. **Batch Processing** - Process multiple docs simultaneously for efficiency
7. **Mixed Precision** - float16 on GPU for 2x speed, float32 on CPU for stability

### Hardware Requirements

```yaml
Minimum (CPU only):
  - RAM: 4 GB
  - Storage: 2 GB (model weights)
  - CPU: 4 cores recommended
  - Latency: 3-5 seconds for 100 docs

Recommended (GPU):
  - GPU: NVIDIA GPU with 4GB+ VRAM (T4, V100, A10)
  - CUDA: 11.8+
  - Latency: 0.8-1.5 seconds for 100 docs
  
Hackathon Setup:
  - Google Cloud Run with CPU (cost-effective)
  - Or Google Compute Engine with T4 GPU (faster)
```

### Adding to Requirements.txt

```txt
# requirements.txt

# PyTorch (CPU version for cost-effective deployment)
torch==2.1.0
# For GPU: torch==2.1.0+cu118

# Transformers
transformers==4.35.2
sentencepiece==0.1.99
accelerate==0.25.0
safetensors==0.4.1

# Other dependencies
google-generativeai==0.3.1
google-cloud-firestore==2.14.0
aiohttp==3.9.1
langchain==0.1.0
langgraph==0.0.20
arize==7.0.0
streamlit==1.29.0
```

---

**Summary**: PyTorch provides the tensor computation engine and GPU acceleration, while Transformers provides the pre-trained BGE model architecture and easy tokenization. Together, they power our zero-hallucination re-ranking system that ensures only the most relevant evidence makes it to synthesis.
