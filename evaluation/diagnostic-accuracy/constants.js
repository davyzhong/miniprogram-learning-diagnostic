'use strict';

const DATASET_SCHEMA_VERSION = '1.0.0';
const SCORER_VERSION = '1.0.0';

const MATCH_THRESHOLDS = Object.freeze({
  regionIou: 0.5,
  textSimilarity: 0.9,
  ambiguityMargin: 0.05,
});

const FORMAL_MINIMUMS = Object.freeze({
  documentsPerSubject: 20,
  itemsPerSubject: 150,
  historical: 100,
  challenge: 40,
});

const guardrail = (key, regression) => Object.freeze({
  key,
  regression,
});

const CORE_GUARDRAILS = Object.freeze([
  guardrail('overall.clearImageDiscoveryRecall', 'decrease'),
  guardrail('overall.classificationAccuracy', 'decrease'),
  guardrail('overall.s1Rate', 'increase'),
  guardrail('overall.unreadableCorrectRejection', 'decrease'),
  guardrail('overall.runCompletion', 'decrease'),
  guardrail('math.nodeTop1', 'decrease'),
  guardrail('math.bottleneckTop1', 'decrease'),
  guardrail('chinese.originalItemLocation', 'decrease'),
  guardrail('chinese.errorType', 'decrease'),
  guardrail('english.wordIdentity', 'decrease'),
  guardrail('english.recognitionSpelling', 'decrease'),
]);

module.exports = Object.freeze({
  DATASET_SCHEMA_VERSION,
  SCORER_VERSION,
  MATCH_THRESHOLDS,
  FORMAL_MINIMUMS,
  CORE_GUARDRAILS,
});
