'use strict';

const { MATCH_THRESHOLDS } = require('./constants');
const { normalizeText, textSimilarity } = require('./normalizers');

const MATCHER_VERSION = '1.0.0';
const CONTEXT_FIELDS = Object.freeze(['subject', 'documentId', 'pageId']);
const THRESHOLD_EPSILON = Number.EPSILON * 4;
const SUPPORTED_REGION_UNITS = Object.freeze(['pixel', 'normalized']);

function validRegion(region) {
  return Boolean(region)
    && typeof region === 'object'
    && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(region[key]))
    && region.x >= 0
    && region.y >= 0
    && region.width > 0
    && region.height > 0;
}

function compatibleRegionUnits(a, b) {
  const aHasUnit = a?.unit !== undefined;
  const bHasUnit = b?.unit !== undefined;
  if (!aHasUnit && !bHasUnit) return true;
  if (!aHasUnit || !bHasUnit) return false;
  return SUPPORTED_REGION_UNITS.includes(a.unit) && a.unit === b.unit;
}

function regionIou(a, b) {
  if (!validRegion(a) || !validRegion(b) || !compatibleRegionUnits(a, b)) return 0;
  const intersectionWidth = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const intersectionHeight = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  if (intersectionWidth === 0 || intersectionHeight === 0) return 0;

  const intersection = intersectionWidth * intersectionHeight;
  const union = (a.width * a.height) + (b.width * b.height) - intersection;
  if (!Number.isFinite(union) || union <= 0) return 0;
  return Math.min(1, Math.max(0, intersection / union));
}

function supplied(value) {
  return typeof value === 'string' && value.length > 0;
}

function subjectOf(item) {
  return item?.subject
    ?? item?.prediction?.attribution?.subject
    ?? item?.humanLabel?.attribution?.subject;
}

function contextOf(item) {
  return {
    subject: subjectOf(item),
    documentId: item?.documentId,
    pageId: item?.pageId,
  };
}

function contextsMatch(left, right) {
  return CONTEXT_FIELDS.every((field) => (
    supplied(left[field]) && supplied(right[field]) && left[field] === right[field]
  ));
}

function contextsConflict(left, right) {
  return CONTEXT_FIELDS.some((field) => (
    supplied(left[field]) && supplied(right[field]) && left[field] !== right[field]
  ));
}

function regionOf(item) {
  return item?.region ?? item?.crop ?? item?.localization ?? item?.prediction?.localization;
}

function textOf(item) {
  if (typeof item?.text === 'string') return item.text;
  if (typeof item?.prediction?.text === 'string') return item.prediction.text;
  if (typeof item?.answer === 'string') return item.answer;
  if (Array.isArray(item?.acceptedAnswers)) return item.acceptedAnswers.find((value) => typeof value === 'string');
  return undefined;
}

function normalizedThresholds(options) {
  const source = options?.thresholds ?? options ?? {};
  const threshold = (key) => (
    Number.isFinite(source[key]) && source[key] >= 0 && source[key] <= 1
      ? source[key]
      : MATCH_THRESHOLDS[key]
  );
  return {
    regionIou: threshold('regionIou'),
    textSimilarity: threshold('textSimilarity'),
    ambiguityMargin: threshold('ambiguityMargin'),
  };
}

function groupBy(records, key) {
  const groups = new Map();
  for (const record of records) {
    const value = record[key];
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(record);
  }
  return groups;
}

function stableCompare(left, right) {
  const leftString = String(left);
  const rightString = String(right);
  if (leftString < rightString) return -1;
  if (leftString > rightString) return 1;
  return 0;
}

function connectedComponents(edges) {
  const adjacency = new Map();
  const add = (node, neighbor) => {
    if (!adjacency.has(node)) adjacency.set(node, new Set());
    adjacency.get(node).add(neighbor);
  };
  for (const edge of edges) {
    const goldNode = `g:${edge.gold.index}`;
    const predictionNode = `p:${edge.prediction.index}`;
    add(goldNode, predictionNode);
    add(predictionNode, goldNode);
  }

  const components = [];
  const visited = new Set();
  for (const start of [...adjacency.keys()].sort(stableCompare)) {
    if (visited.has(start)) continue;
    const pending = [start];
    const component = { goldIndexes: new Set(), predictionIndexes: new Set() };
    while (pending.length > 0) {
      const node = pending.pop();
      if (visited.has(node)) continue;
      visited.add(node);
      const [kind, rawIndex] = node.split(':');
      const index = Number(rawIndex);
      if (kind === 'g') component.goldIndexes.add(index);
      else component.predictionIndexes.add(index);
      for (const neighbor of adjacency.get(node) ?? []) pending.push(neighbor);
    }
    components.push(component);
  }
  return components;
}

function minimalContext(idKey, id, context) {
  const result = { [idKey]: id };
  for (const field of CONTEXT_FIELDS) {
    if (supplied(context[field])) result[field] = context[field];
  }
  return result;
}

function matchEvaluationItems(goldItems, predictions, options) {
  const thresholds = normalizedThresholds(options);
  const rawGold = Array.isArray(goldItems) ? goldItems : [];
  const rawPredictions = Array.isArray(predictions) ? predictions : [];
  const goldRecords = rawGold.map((item, index) => ({
    index,
    item,
    sampleId: typeof item?.sampleId === 'string' ? item.sampleId : '',
    context: contextOf(item),
  }));
  const predictionRecords = rawPredictions.map((item, index) => ({
    index,
    item,
    predictionId: typeof item?.predictionId === 'string'
      ? item.predictionId
      : (typeof item?.id === 'string' ? item.id : (typeof item?.sampleId === 'string' ? item.sampleId : '')),
    claimedSampleId: typeof item?.sampleId === 'string' ? item.sampleId : '',
    context: contextOf(item),
  }));

  const consumedGold = new Set();
  const consumedPredictions = new Set();
  const matches = [];
  const unresolved = [];

  const addUnresolved = (reason, goldGroup, predictionGroup) => {
    const availableGold = goldGroup.filter((record) => !consumedGold.has(record.index));
    const availablePredictions = predictionGroup.filter((record) => !consumedPredictions.has(record.index));
    if (availableGold.length === 0 && availablePredictions.length === 0) return;
    availableGold.forEach((record) => consumedGold.add(record.index));
    availablePredictions.forEach((record) => consumedPredictions.add(record.index));
    unresolved.push({
      reason,
      goldIds: availableGold.map((record) => record.sampleId).sort(stableCompare),
      predictionIds: availablePredictions.map((record) => record.predictionId).sort(stableCompare),
    });
  };

  const goldById = groupBy(goldRecords, 'sampleId');
  const predictionsByClaim = groupBy(predictionRecords.filter((record) => record.claimedSampleId), 'claimedSampleId');
  const exactAdjacency = new Map();
  const exactReasons = new Map();
  const goldNode = (record) => `g:${record.index}`;
  const predictionNode = (record) => `p:${record.index}`;
  const linkExactEvidence = (leftNode, rightNode, reason) => {
    for (const [node, neighbor] of [[leftNode, rightNode], [rightNode, leftNode]]) {
      if (!exactAdjacency.has(node)) exactAdjacency.set(node, new Set());
      exactAdjacency.get(node).add(neighbor);
      if (!exactReasons.has(node)) exactReasons.set(node, new Set());
      exactReasons.get(node).add(reason);
    }
  };
  const linkGroup = (records, nodeFor, reason) => {
    for (let index = 1; index < records.length; index += 1) {
      linkExactEvidence(nodeFor(records[0]), nodeFor(records[index]), reason);
    }
  };
  const linkGoldClaims = (goldGroup, predictionGroup, reason) => {
    for (const goldRecord of goldGroup) {
      for (const predictionRecord of predictionGroup) {
        linkExactEvidence(goldNode(goldRecord), predictionNode(predictionRecord), reason);
      }
    }
  };

  for (const duplicateGroup of goldById.values()) {
    if (duplicateGroup.length <= 1) continue;
    linkGroup(duplicateGroup, goldNode, 'duplicate-gold-id');
    linkGoldClaims(
      duplicateGroup,
      predictionsByClaim.get(duplicateGroup[0].sampleId) ?? [],
      'duplicate-gold-id',
    );
  }

  for (const duplicateGroup of groupBy(predictionRecords, 'predictionId').values()) {
    if (duplicateGroup.length <= 1) continue;
    linkGroup(duplicateGroup, predictionNode, 'duplicate-prediction-id');
    for (const predictionRecord of duplicateGroup) {
      linkGoldClaims(
        goldById.get(predictionRecord.claimedSampleId) ?? [],
        [predictionRecord],
        'duplicate-prediction-id',
      );
    }
  }

  for (const duplicateGroup of predictionsByClaim.values()) {
    if (duplicateGroup.length <= 1) continue;
    linkGroup(duplicateGroup, predictionNode, 'duplicate-sample-claim');
    linkGoldClaims(
      goldById.get(duplicateGroup[0].claimedSampleId) ?? [],
      duplicateGroup,
      'duplicate-sample-claim',
    );
  }

  for (const [sampleId, goldGroup] of goldById) {
    for (const goldRecord of goldGroup) {
      for (const predictionRecord of predictionsByClaim.get(sampleId) ?? []) {
        if (contextsConflict(goldRecord.context, predictionRecord.context)) {
          linkExactEvidence(goldNode(goldRecord), predictionNode(predictionRecord), 'context-conflict');
        }
      }
    }
  }

  const exactReasonPriority = [
    'duplicate-gold-id',
    'duplicate-prediction-id',
    'duplicate-sample-claim',
    'context-conflict',
  ];
  const visitedExactNodes = new Set();
  for (const start of [...exactAdjacency.keys()].sort(stableCompare)) {
    if (visitedExactNodes.has(start)) continue;
    const pending = [start];
    const componentGoldIndexes = new Set();
    const componentPredictionIndexes = new Set();
    const componentReasons = new Set();
    while (pending.length > 0) {
      const node = pending.pop();
      if (visitedExactNodes.has(node)) continue;
      visitedExactNodes.add(node);
      const [kind, rawIndex] = node.split(':');
      if (kind === 'g') componentGoldIndexes.add(Number(rawIndex));
      else componentPredictionIndexes.add(Number(rawIndex));
      for (const reason of exactReasons.get(node) ?? []) componentReasons.add(reason);
      for (const neighbor of exactAdjacency.get(node) ?? []) pending.push(neighbor);
    }
    const reason = exactReasonPriority.find((candidate) => componentReasons.has(candidate));
    addUnresolved(
      reason,
      goldRecords.filter((record) => componentGoldIndexes.has(record.index)),
      predictionRecords.filter((record) => componentPredictionIndexes.has(record.index)),
    );
  }

  for (const sampleId of [...goldById.keys()].sort(stableCompare)) {
    const goldGroup = goldById.get(sampleId).filter((record) => !consumedGold.has(record.index));
    const predictionGroup = (predictionsByClaim.get(sampleId) ?? [])
      .filter((record) => !consumedPredictions.has(record.index));
    if (goldGroup.length !== 1 || predictionGroup.length !== 1) continue;
    const goldRecord = goldGroup[0];
    const predictionRecord = predictionGroup[0];
    if (!contextsMatch(goldRecord.context, predictionRecord.context)) continue;
    consumedGold.add(goldRecord.index);
    consumedPredictions.add(predictionRecord.index);
    matches.push({
      sampleId: goldRecord.sampleId,
      predictionId: predictionRecord.predictionId,
      method: 'sampleId',
      score: 1,
    });
  }

  const remainingGold = () => goldRecords.filter((record) => !consumedGold.has(record.index));
  const remainingPredictions = () => predictionRecords.filter((record) => !consumedPredictions.has(record.index));

  const regionEdges = [];
  for (const goldRecord of remainingGold()) {
    for (const predictionRecord of remainingPredictions()) {
      if (!contextsMatch(goldRecord.context, predictionRecord.context)) continue;
      const score = regionIou(regionOf(goldRecord.item), regionOf(predictionRecord.item));
      if (score + THRESHOLD_EPSILON >= thresholds.regionIou) {
        const stableScore = score < thresholds.regionIou ? thresholds.regionIou : score;
        regionEdges.push({ gold: goldRecord, prediction: predictionRecord, score: stableScore });
      }
    }
  }
  for (const component of connectedComponents(regionEdges)) {
    const componentGold = goldRecords.filter((record) => component.goldIndexes.has(record.index));
    const componentPredictions = predictionRecords.filter((record) => component.predictionIndexes.has(record.index));
    if (componentGold.length === 1 && componentPredictions.length === 1) {
      const edge = regionEdges.find((candidate) => (
        candidate.gold.index === componentGold[0].index
        && candidate.prediction.index === componentPredictions[0].index
      ));
      consumedGold.add(edge.gold.index);
      consumedPredictions.add(edge.prediction.index);
      matches.push({
        sampleId: edge.gold.sampleId,
        predictionId: edge.prediction.predictionId,
        method: 'region-iou',
        score: edge.score,
      });
    } else {
      addUnresolved('ambiguous-region', componentGold, componentPredictions);
    }
  }

  const textEdges = [];
  for (const goldRecord of remainingGold()) {
    for (const predictionRecord of remainingPredictions()) {
      if (!contextsMatch(goldRecord.context, predictionRecord.context)) continue;
      const goldText = textOf(goldRecord.item);
      const predictionText = textOf(predictionRecord.item);
      if (typeof goldText !== 'string' || typeof predictionText !== 'string') continue;
      const subject = goldRecord.context.subject ?? predictionRecord.context.subject;
      const normalizedGold = normalizeText(goldText, subject);
      const normalizedPrediction = normalizeText(predictionText, subject);
      if (normalizedGold.length === 0 || normalizedPrediction.length === 0) continue;
      const score = textSimilarity(normalizedGold, normalizedPrediction);
      if (score + THRESHOLD_EPSILON >= thresholds.textSimilarity) {
        const stableScore = score < thresholds.textSimilarity ? thresholds.textSimilarity : score;
        textEdges.push({ gold: goldRecord, prediction: predictionRecord, score: stableScore });
      }
    }
  }

  const goldTextAdjacency = new Map();
  const predictionTextAdjacency = new Map();
  const addTextEdge = (adjacency, index, edge) => {
    if (!adjacency.has(index)) adjacency.set(index, []);
    adjacency.get(index).push(edge);
  };
  for (const edge of textEdges) {
    addTextEdge(goldTextAdjacency, edge.gold.index, edge);
    addTextEdge(predictionTextAdjacency, edge.prediction.index, edge);
  }
  const compareTextEdges = (left, right) => right.score - left.score
    || stableCompare(left.gold.sampleId, right.gold.sampleId)
    || stableCompare(left.prediction.predictionId, right.prediction.predictionId);
  const cacheDecisiveTops = (adjacency) => {
    const decisiveTops = new Map();
    for (const [index, edges] of adjacency) {
      edges.sort(compareTextEdges);
      const runnerUpScore = edges[1]?.score ?? -Infinity;
      const winner = edges[0].score - runnerUpScore + THRESHOLD_EPSILON >= thresholds.ambiguityMargin
        ? edges[0]
        : undefined;
      decisiveTops.set(index, winner);
    }
    return decisiveTops;
  };
  const goldDecisiveTops = cacheDecisiveTops(goldTextAdjacency);
  const predictionDecisiveTops = cacheDecisiveTops(predictionTextAdjacency);

  const selectedTextEdges = textEdges.filter((edge) => (
    goldDecisiveTops.get(edge.gold.index) === edge
    && predictionDecisiveTops.get(edge.prediction.index) === edge
  )).sort((left, right) => stableCompare(left.gold.sampleId, right.gold.sampleId));
  for (const edge of selectedTextEdges) {
    if (consumedGold.has(edge.gold.index) || consumedPredictions.has(edge.prediction.index)) continue;
    consumedGold.add(edge.gold.index);
    consumedPredictions.add(edge.prediction.index);
    matches.push({
      sampleId: edge.gold.sampleId,
      predictionId: edge.prediction.predictionId,
      method: 'text-similarity',
      score: edge.score,
    });
  }

  const ambiguousTextEdges = textEdges.filter((edge) => (
    !consumedGold.has(edge.gold.index) && !consumedPredictions.has(edge.prediction.index)
  ));
  for (const component of connectedComponents(ambiguousTextEdges)) {
    addUnresolved(
      'ambiguous-text',
      goldRecords.filter((record) => component.goldIndexes.has(record.index)),
      predictionRecords.filter((record) => component.predictionIndexes.has(record.index)),
    );
  }

  const missed = remainingGold().map((record) => (
    minimalContext('sampleId', record.sampleId, record.context)
  ));
  const hallucinated = remainingPredictions().map((record) => (
    minimalContext('predictionId', record.predictionId, record.context)
  ));

  matches.sort((left, right) => stableCompare(left.sampleId, right.sampleId)
    || stableCompare(left.predictionId, right.predictionId));
  missed.sort((left, right) => stableCompare(left.sampleId, right.sampleId));
  hallucinated.sort((left, right) => stableCompare(left.predictionId, right.predictionId));
  unresolved.sort((left, right) => stableCompare(left.reason, right.reason)
    || stableCompare(left.goldIds.join('\u0000'), right.goldIds.join('\u0000'))
    || stableCompare(left.predictionIds.join('\u0000'), right.predictionIds.join('\u0000')));

  return { matches, missed, hallucinated, unresolved };
}

module.exports = Object.freeze({
  MATCHER_VERSION,
  regionIou,
  matchEvaluationItems,
});
