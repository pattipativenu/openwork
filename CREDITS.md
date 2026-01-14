# Image Credits & Attribution

MedGuidance AI uses medical images from open-access sources. All images are properly attributed according to their respective licenses.

## Image Sources

### 1. Open-i (National Library of Medicine)
- **Website**: https://openi.nlm.nih.gov
- **License**: Free for reuse with attribution
- **Content**: Biomedical images from PubMed Central and other open-access sources
- **Attribution**: "Image from Open-i, National Library of Medicine (https://openi.nlm.nih.gov). Free for reuse with attribution."
- **Usage**: Medical imaging, radiology, pathology, clinical images
- **In Use**: ✅ Active


## How Attribution is Displayed

When users click on an image to zoom in, they can click the **Info (ℹ️) button** in the top-right corner to see full attribution details including:

- Source name and organization
- License type
- Description of the source
- Link to the original source website
- Attribution requirements notice

## License Compliance

### Open-i (NLM)
Images from PubMed Central are generally free for reuse with attribution. Specific licensing may vary by article.

## Attribution in Code

All images in MedGuidance AI include structured attribution data:

```typescript
{
  url: string;           // Image URL
  title: string;         // Image title
  source: string;        // Source badge (e.g., "Open-i")
  license: string;       // License type
  attribution: string;   // Full attribution text
}
```

## Acknowledgments

We thank the following organizations for making their medical images freely available:

- **National Library of Medicine (NLM)** - Open-i biomedical image search
- **PubMed Central** - Open-access biomedical literature

## Questions?

For questions about image licensing or attribution, please refer to the original source websites listed above.

---

*Last Updated: January 2026*
