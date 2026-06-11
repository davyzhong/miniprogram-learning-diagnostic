function normalizeOcrSummary(summary) {
  return String(summary || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}=+\-×÷/]/gu, '')
    .slice(0, 4000);
}

function markDuplicatePages(pages, historicalPhotos = []) {
  const firstByFingerprint = new Map();

  for (const photo of historicalPhotos) {
    const fingerprint = normalizeOcrSummary(photo.ocrSummary);
    if (fingerprint && !firstByFingerprint.has(fingerprint)) {
      firstByFingerprint.set(fingerprint, photo.fileID || '');
    }
  }

  return pages.map(page => {
    const contentFingerprint = normalizeOcrSummary(page.ocrSummary);
    const duplicateOf = contentFingerprint
      ? firstByFingerprint.get(contentFingerprint) || ''
      : '';
    const result = {
      ...page,
      contentFingerprint,
      isDuplicate: Boolean(duplicateOf),
      duplicateOf,
    };

    if (contentFingerprint && !duplicateOf) {
      firstByFingerprint.set(contentFingerprint, page.fileID || '');
    }
    return result;
  });
}

module.exports = {
  normalizeOcrSummary,
  markDuplicatePages,
};
