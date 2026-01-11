
import { extractDiseaseTags, extractDecisionTags, prioritizeTags } from './lib/evidence/pico-extractor.ts';

const queries = [
    "In adults with moderate-to-severe ulcerative colitis who have failed anti-TNF therapy, how does vedolizumab compare to ustekinumab regarding clinical remission and safety?",
    "In patients with metastatic non-small cell lung cancer, EGFR exon 20 insertion mutations, what are the recommended targeted therapies (e.g. amivantamab, mobocertinib) after platinum-based chemotherapy failure?",
    "For a patient with newly diagnosed HFrEF (LVEF <=40%), what do current ESC/ACC/AHA guidelines recommend as foundational pharmacologic therapy (drug classes and sequence)?"
];

// Mock expandMedicalAbbreviations if not available, or import it
// Assuming it's not exported from pico-extractor, we might need to rely on what extractDiseaseTags does internally (it calls it).
// But extractDiseaseTags is exported.
// We just run it and see the logs (since I added logs to it!).

async function run() {
    console.log("--- Starting Tag Verification ---");
    for (const query of queries) {
        console.log(`\nQuery: "${query}"`);
        try {
            const diseaseTags = extractDiseaseTags(query);
            console.log("Disease Tags:", diseaseTags);

            const decisionTags = extractDecisionTags(query);
            console.log("Decision Tags:", decisionTags);

            const pTags = prioritizeTags(diseaseTags, query);
            console.log("Prioritized:", pTags);

        } catch (error) {
            console.error("Error:", error);
        }
    }
}

run();
