#!/usr/bin/env python3
"""
JEAN Nanopore Data Processing Pipeline

Author: Ibrahim A. G. A. (amrgalalibrahim@gmail.com)
Version: 3.0.0

This module handles the data acquisition step from the flowchart:
- Processes FASTQ and BAM files from nanopore sequencing
- Extracts methylation & standard reads
- Handles quality control and filtering
- Supports both methylation-aware and standard sequencing data
"""

import os
import sys
import gzip
import logging
from pathlib import Path
from typing import Dict, List, Tuple, Optional, Iterator, Any
from dataclasses import dataclass
import numpy as np
import pandas as pd

# Try to import bioinformatics libraries
try:
    import pysam
    PYSAM_AVAILABLE = True
except ImportError:
    PYSAM_AVAILABLE = False
    logging.warning("pysam not available. BAM processing will use fallback methods.")

try:
    from Bio import SeqIO
    from Bio.Seq import Seq
    from Bio.SeqRecord import SeqRecord
    BIOPYTHON_AVAILABLE = True
except ImportError:
    BIOPYTHON_AVAILABLE = False
    logging.warning("BioPython not available. Using fallback sequence processing.")

logger = logging.getLogger(__name__)

@dataclass
class NanoporeRead:
    """Nanopore sequencing read data structure"""
    read_id: str
    sequence: str
    quality: str
    length: int
    mean_quality: float
    
    # Alignment information (for BAM files)
    chromosome: str = ""
    start_pos: int = 0
    end_pos: int = 0
    strand: str = "+"
    mapping_quality: int = 0
    
    # Modification information
    mm_tag: str = ""
    ml_tag: str = ""
    modifications: List[Dict[str, Any]] = None
    
    # Quality metrics
    gc_content: float = 0.0
    n_content: float = 0.0
    
    def __post_init__(self):
        if self.modifications is None:
            self.modifications = []
        
        # Calculate GC content
        if self.sequence:
            gc_count = self.sequence.count('G') + self.sequence.count('C')
            self.gc_content = (gc_count / len(self.sequence)) * 100
            
            n_count = self.sequence.count('N')
            self.n_content = (n_count / len(self.sequence)) * 100
    
    def has_modifications(self) -> bool:
        """Check if read has modification information"""
        return bool(self.mm_tag or self.modifications)
    
    def get_modification_sites(self) -> List[Dict[str, Any]]:
        """Extract modification sites from MM and ML tags"""
        sites = []
        
        if self.mm_tag:
            # Parse MM tag format: "C+m,1,2,3;A+a,5,10"
            modifications = self.mm_tag.split(';')
            for mod in modifications:
                if ',' in mod:
                    parts = mod.split(',')
                    mod_type = parts[0]  # e.g., "C+m"
                    positions = [int(p) for p in parts[1:] if p.isdigit()]
                    
                    for pos in positions:
                        sites.append({
                            'type': mod_type,
                            'position': pos,
                            'probability': 1.0  # Default for MM tags
                        })
        
        return sites

@dataclass
class NanoporeDataset:
    """Container for processed nanopore dataset"""
    reads: List[NanoporeRead]
    total_reads: int
    total_bases: int
    mean_read_length: float
    mean_quality_score: float
    
    # Quality metrics
    reads_with_modifications: int = 0
    modification_rate: float = 0.0
    
    # File information
    input_file: str = ""
    file_format: str = ""
    
    def __post_init__(self):
        # Calculate modification statistics
        self.reads_with_modifications = sum(1 for read in self.reads if read.has_modifications())
        self.modification_rate = (self.reads_with_modifications / self.total_reads * 100) if self.total_reads > 0 else 0.0
    
    def get_summary(self) -> Dict[str, Any]:
        """Get dataset summary statistics"""
        return {
            'input_file': self.input_file,
            'file_format': self.file_format,
            'total_reads': self.total_reads,
            'total_bases': self.total_bases,
            'mean_read_length': f"{self.mean_read_length:.1f}",
            'mean_quality_score': f"{self.mean_quality_score:.1f}",
            'reads_with_modifications': self.reads_with_modifications,
            'modification_rate': f"{self.modification_rate:.2f}%"
        }

class NanoporePipeline:
    """
    Nanopore Data Processing Pipeline
    
    Handles Step 1 from the flowchart:
    - Data Acquisition (Nanopore Sequencing Data)
    - Processes both methylation & standard reads
    - Quality control and filtering
    """
    
    def __init__(self, config):
        """Initialize nanopore pipeline"""
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        # Quality control parameters
        self.min_read_length = getattr(config, 'min_read_length', 100)
        self.min_quality_score = getattr(config, 'min_quality_score', 7)
        self.max_n_content = getattr(config, 'max_n_content', 10.0)  # Maximum N content percentage
        
        self.logger.info(f"NanoporePipeline initialized with min_length={self.min_read_length}, min_quality={self.min_quality_score}")
    
    def process_file(self, input_file: str) -> NanoporeDataset:
        """
        Process nanopore sequencing file (FASTQ or BAM)
        
        Args:
            input_file: Path to input file
            
        Returns:
            NanoporeDataset containing processed reads
        """
        file_path = Path(input_file)
        if not file_path.exists():
            raise FileNotFoundError(f"Input file not found: {input_file}")
        
        file_extension = file_path.suffix.lower()
        
        self.logger.info(f"Processing nanopore file: {input_file}")
        self.logger.info(f"File format: {file_extension}")
        
        if file_extension in ['.fastq', '.fq', '.fastq.gz', '.fq.gz']:
            dataset = self._process_fastq(input_file)
        elif file_extension in ['.bam', '.sam']:
            dataset = self._process_bam(input_file)
        else:
            raise ValueError(f"Unsupported file format: {file_extension}. Supported formats: FASTQ, BAM, SAM")
        
        dataset.input_file = input_file
        dataset.file_format = file_extension
        
        self.logger.info(f"Processing completed: {dataset.get_summary()}")
        
        return dataset
    
    def _process_fastq(self, fastq_file: str) -> NanoporeDataset:
        """
        Process FASTQ file
        
        FASTQ format contains:
        - Read ID
        - Sequence
        - Quality scores
        - No modification information (MM tags not available in FASTQ)
        """
        self.logger.info("Processing FASTQ file...")
        
        reads = []
        total_bases = 0
        quality_scores = []
        
        try:
            # Handle compressed files
            if fastq_file.endswith('.gz'):
                file_handle = gzip.open(fastq_file, 'rt')
            else:
                file_handle = open(fastq_file, 'r')
            
            if BIOPYTHON_AVAILABLE:
                # Use BioPython for robust FASTQ parsing
                for record in SeqIO.parse(file_handle, "fastq"):
                    read = self._create_read_from_seqrecord(record)
                    
                    # Quality control
                    if self._passes_quality_control(read):
                        reads.append(read)
                        total_bases += read.length
                        quality_scores.append(read.mean_quality)
            else:
                # Fallback FASTQ parser
                reads_data = self._parse_fastq_manual(file_handle)
                for read_data in reads_data:
                    read = self._create_read_from_dict(read_data)
                    
                    if self._passes_quality_control(read):
                        reads.append(read)
                        total_bases += read.length
                        quality_scores.append(read.mean_quality)
            
            file_handle.close()
            
        except Exception as e:
            self.logger.error(f"Error processing FASTQ file: {str(e)}")
            raise
        
        # Calculate statistics
        total_reads = len(reads)
        mean_read_length = total_bases / total_reads if total_reads > 0 else 0
        mean_quality_score = np.mean(quality_scores) if quality_scores else 0
        
        dataset = NanoporeDataset(
            reads=reads,
            total_reads=total_reads,
            total_bases=total_bases,
            mean_read_length=mean_read_length,
            mean_quality_score=mean_quality_score
        )
        
        self.logger.info(f"FASTQ processing completed: {total_reads} reads, {total_bases} bases")
        
        return dataset
    
    def _process_bam(self, bam_file: str) -> NanoporeDataset:
        """
        Process BAM file
        
        BAM format contains:
        - Aligned reads with genomic coordinates
        - Quality scores
        - Modification information in MM/ML tags
        """
        self.logger.info("Processing BAM file...")
        
        reads = []
        total_bases = 0
        quality_scores = []
        
        try:
            if PYSAM_AVAILABLE:
                # Use pysam for robust BAM processing
                with pysam.AlignmentFile(bam_file, "rb") as bam:
                    for alignment in bam:
                        read = self._create_read_from_alignment(alignment)
                        
                        # Quality control
                        if self._passes_quality_control(read):
                            reads.append(read)
                            total_bases += read.length
                            quality_scores.append(read.mean_quality)
            else:
                # Fallback BAM processing (limited functionality)
                self.logger.warning("pysam not available. Using limited BAM processing.")
                reads_data = self._parse_bam_manual(bam_file)
                for read_data in reads_data:
                    read = self._create_read_from_dict(read_data)
                    
                    if self._passes_quality_control(read):
                        reads.append(read)
                        total_bases += read.length
                        quality_scores.append(read.mean_quality)
        
        except Exception as e:
            self.logger.error(f"Error processing BAM file: {str(e)}")
            raise
        
        # Calculate statistics
        total_reads = len(reads)
        mean_read_length = total_bases / total_reads if total_reads > 0 else 0
        mean_quality_score = np.mean(quality_scores) if quality_scores else 0
        
        dataset = NanoporeDataset(
            reads=reads,
            total_reads=total_reads,
            total_bases=total_bases,
            mean_read_length=mean_read_length,
            mean_quality_score=mean_quality_score
        )
        
        self.logger.info(f"BAM processing completed: {total_reads} reads, {total_bases} bases")
        
        return dataset
    
    def _create_read_from_seqrecord(self, record) -> NanoporeRead:
        """Create NanoporeRead from BioPython SeqRecord"""
        sequence = str(record.seq)
        quality = record.letter_annotations.get('phred_quality', [])
        
        # Calculate mean quality
        mean_quality = np.mean(quality) if quality else 0
        
        read = NanoporeRead(
            read_id=record.id,
            sequence=sequence,
            quality=''.join([chr(q + 33) for q in quality]) if quality else '',
            length=len(sequence),
            mean_quality=mean_quality
        )
        
        return read
    
    def _create_read_from_alignment(self, alignment) -> NanoporeRead:
        """Create NanoporeRead from pysam AlignmentSegment"""
        sequence = alignment.query_sequence or ""
        quality_array = alignment.query_qualities or []
        
        # Calculate mean quality
        mean_quality = np.mean(quality_array) if quality_array else 0
        
        # Extract modification information
        mm_tag = alignment.get_tag("MM") if alignment.has_tag("MM") else ""
        ml_tag = alignment.get_tag("ML") if alignment.has_tag("ML") else ""
        
        read = NanoporeRead(
            read_id=alignment.query_name,
            sequence=sequence,
            quality=''.join([chr(q + 33) for q in quality_array]) if quality_array else '',
            length=len(sequence),
            mean_quality=mean_quality,
            chromosome=alignment.reference_name or "",
            start_pos=alignment.reference_start or 0,
            end_pos=alignment.reference_end or 0,
            strand="+" if not alignment.is_reverse else "-",
            mapping_quality=alignment.mapping_quality,
            mm_tag=mm_tag,
            ml_tag=ml_tag
        )
        
        return read
    
    def _create_read_from_dict(self, read_data: Dict[str, Any]) -> NanoporeRead:
        """Create NanoporeRead from dictionary (fallback method)"""
        sequence = read_data.get('sequence', '')
        quality_str = read_data.get('quality', '')
        
        # Calculate mean quality from quality string
        if quality_str:
            quality_scores = [ord(c) - 33 for c in quality_str]
            mean_quality = np.mean(quality_scores)
        else:
            mean_quality = 0
        
        read = NanoporeRead(
            read_id=read_data.get('read_id', ''),
            sequence=sequence,
            quality=quality_str,
            length=len(sequence),
            mean_quality=mean_quality,
            mm_tag=read_data.get('mm_tag', ''),
            ml_tag=read_data.get('ml_tag', '')
        )
        
        return read
    
    def _parse_fastq_manual(self, file_handle) -> List[Dict[str, Any]]:
        """Manual FASTQ parser (fallback when BioPython not available)"""
        reads = []
        
        while True:
            # Read 4 lines for each FASTQ record
            header = file_handle.readline().strip()
            if not header:
                break
            
            sequence = file_handle.readline().strip()
            plus_line = file_handle.readline().strip()
            quality = file_handle.readline().strip()
            
            if header.startswith('@') and plus_line.startswith('+'):
                read_id = header[1:].split()[0]  # Remove @ and take first part
                reads.append({
                    'read_id': read_id,
                    'sequence': sequence,
                    'quality': quality
                })
        
        return reads
    
    def _parse_bam_manual(self, bam_file: str) -> List[Dict[str, Any]]:
        """Manual BAM parser (very limited fallback)"""
        # This is a placeholder - real BAM parsing without pysam is complex
        self.logger.warning("Manual BAM parsing not fully implemented. Using mock data.")
        
        # Return mock data for testing
        reads = []
        for i in range(100):
            reads.append({
                'read_id': f'read_{i:06d}',
                'sequence': 'ATCGATCGATCGATCG' * 20,
                'quality': 'IIIIIIIIIIIIIIII' * 20,
                'mm_tag': 'C+m,5,10,15' if i % 10 == 0 else ''
            })
        
        return reads
    
    def _passes_quality_control(self, read: NanoporeRead) -> bool:
        """
        Apply quality control filters
        
        Args:
            read: NanoporeRead to check
            
        Returns:
            True if read passes quality control
        """
        # Length filter
        if read.length < self.min_read_length:
            return False
        
        # Quality score filter
        if read.mean_quality < self.min_quality_score:
            return False
        
        # N content filter
        if read.n_content > self.max_n_content:
            return False
        
        return True
    
    def filter_reads(self, dataset: NanoporeDataset, 
                    min_length: int = None,
                    min_quality: float = None,
                    max_n_content: float = None) -> NanoporeDataset:
        """
        Apply additional filtering to dataset
        
        Args:
            dataset: Input dataset
            min_length: Minimum read length
            min_quality: Minimum mean quality score
            max_n_content: Maximum N content percentage
            
        Returns:
            Filtered dataset
        """
        self.logger.info("Applying additional read filters...")
        
        # Use provided parameters or defaults
        min_length = min_length or self.min_read_length
        min_quality = min_quality or self.min_quality_score
        max_n_content = max_n_content or self.max_n_content
        
        filtered_reads = []
        total_bases = 0
        quality_scores = []
        
        for read in dataset.reads:
            if (read.length >= min_length and 
                read.mean_quality >= min_quality and 
                read.n_content <= max_n_content):
                
                filtered_reads.append(read)
                total_bases += read.length
                quality_scores.append(read.mean_quality)
        
        # Calculate new statistics
        total_reads = len(filtered_reads)
        mean_read_length = total_bases / total_reads if total_reads > 0 else 0
        mean_quality_score = np.mean(quality_scores) if quality_scores else 0
        
        filtered_dataset = NanoporeDataset(
            reads=filtered_reads,
            total_reads=total_reads,
            total_bases=total_bases,
            mean_read_length=mean_read_length,
            mean_quality_score=mean_quality_score,
            input_file=dataset.input_file,
            file_format=dataset.file_format
        )
        
        self.logger.info(f"Filtering completed: {len(dataset.reads)} -> {total_reads} reads")
        
        return filtered_dataset
    
    def get_modification_summary(self, dataset: NanoporeDataset) -> Dict[str, Any]:
        """
        Get summary of modifications found in dataset
        
        Args:
            dataset: Processed dataset
            
        Returns:
            Dictionary with modification statistics
        """
        modification_types = {}
        total_modifications = 0
        
        for read in dataset.reads:
            if read.has_modifications():
                sites = read.get_modification_sites()
                for site in sites:
                    mod_type = site['type']
                    if mod_type not in modification_types:
                        modification_types[mod_type] = 0
                    modification_types[mod_type] += 1
                    total_modifications += 1
        
        return {
            'total_modifications': total_modifications,
            'modification_types': modification_types,
            'reads_with_modifications': dataset.reads_with_modifications,
            'modification_rate': dataset.modification_rate
        }

def main():
    """Test the nanopore pipeline"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Test JEAN Nanopore Pipeline")
    parser.add_argument("input_file", help="Input FASTQ or BAM file")
    parser.add_argument("--min-length", type=int, default=100, help="Minimum read length")
    parser.add_argument("--min-quality", type=float, default=7, help="Minimum quality score")
    
    args = parser.parse_args()
    
    # Mock config object
    class MockConfig:
        def __init__(self):
            self.min_read_length = args.min_length
            self.min_quality_score = args.min_quality
            self.max_n_content = 10.0
    
    config = MockConfig()
    
    # Test pipeline
    pipeline = NanoporePipeline(config)
    dataset = pipeline.process_file(args.input_file)
    
    print("\nNanopore Pipeline Test Results:")
    print("=" * 50)
    
    summary = dataset.get_summary()
    for key, value in summary.items():
        print(f"{key.replace('_', ' ').title()}: {value}")
    
    # Test modification summary
    mod_summary = pipeline.get_modification_summary(dataset)
    print(f"\nModification Summary:")
    for key, value in mod_summary.items():
        print(f"{key.replace('_', ' ').title()}: {value}")

if __name__ == "__main__":
    main()

