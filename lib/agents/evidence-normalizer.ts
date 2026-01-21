/**
 * Agent 3: Evidence Normalizer
 * Converts all source formats into unified EvidenceCandidate objects
 * Pure Python transformation (NO LLM)
 */

import { EvidenceCandidate, TraceContext } from './types';
import { RetrievalResults } from './multi-source-retrieval';

export class EvidenceNormalizer {
  normalizeAll(rawResults: RetrievalResults): EvidenceCandidate[] {
    const candidates: EvidenceCandidate[] = [];
    const seenIds = new Set<string>();

    // Guidelines
    for (const doc of rawResults.guidelines) {
      const candidate: EvidenceCandidate = {
        source: 'indian_guideline',
        id: doc.chunk_id,
        title: doc.title,
        text: doc.text,
        metadata: {
          organization: doc.organization,
          year: doc.year,
          guideline_id: doc.guideline_id,
          similarity_score: doc.similarity_score
        },
        full_text_available: false
      };
      
      if (!seenIds.has(candidate.id)) {
        candidates.push(candidate);
        seenIds.add(candidate.id);
      }
    }

    // PubMed
    for (const doc of rawResults.pubmed) {
      const pmid = doc.pmid;
      
      if (!seenIds.has(pmid)) {
        const candidate: EvidenceCandidate = {
          source: 'pubmed',
          id: pmid,
          title: doc.title,
          text: doc.abstract,
          metadata: {
            authors: doc.authors,
            journal: doc.journal,
            pub_date: doc.pub_date,
            doi: doc.doi,
            pmcid: doc.pmcid,
            pub_types: doc.pub_types
          },
          full_text_available: doc.full_text_available
        };
        
        candidates.push(candidate);
        seenIds.add(pmid);
      }
    }

    // DailyMed
    for (const doc of rawResults.dailymed) {
      const setid = doc.setid;
      
      if (!seenIds.has(setid)) {
        // Combine relevant sections
        const textParts: string[] = [];
        const sectionOrder = ['indications', 'dosage', 'clinical_pharmacology', 'warnings', 'adverse_reactions'];
        
        for (const sectionName of sectionOrder) {
          if (doc.sections[sectionName]) {
            textParts.push(`${sectionName.toUpperCase()}:\n${doc.sections[sectionName]}`);
          }
        }

        const candidate: EvidenceCandidate = {
          source: 'dailymed',
          id: setid,
          title: doc.title,
          text: textParts.join('\n\n'),
          metadata: {
            drug_name: doc.drug_name,
            published: doc.published,
            all_sections: doc.sections
          },
          full_text_available: true,
          full_text_sections: doc.sections
        };
        
        candidates.push(candidate);
        seenIds.add(setid);
      }
    }

    // Tavily (if present)
    for (const doc of rawResults.tavily) {
      const url = doc.url;
      
      if (!seenIds.has(url)) {
        const candidate: EvidenceCandidate = {
          source: 'tavily_web',
          id: url,
          title: doc.title,
          text: doc.content,
          metadata: {
            url: url,
            score: doc.score,
            published_date: doc.published_date
          },
          full_text_available: false
        };
        
        candidates.push(candidate);
        seenIds.add(url);
      }
    }

    console.log(`🔄 Evidence normalization: ${candidates.length} unified candidates`);
    console.log(`   Guidelines: ${rawResults.guidelines.length}`);
    console.log(`   PubMed: ${rawResults.pubmed.length}`);
    console.log(`   DailyMed: ${rawResults.dailymed.length}`);
    console.log(`   Tavily: ${rawResults.tavily.length}`);

    return candidates;
  }
}