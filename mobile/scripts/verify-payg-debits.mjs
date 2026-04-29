import { PAYG_FEATURES } from '../src/constants/paygFeatures.ts';
import { computePaygChargeMru } from '../src/utils/paygCharge.ts';

function assertEq(label, a, b) {
  if (a !== b) {
    console.error(`FAIL ${label}: expected ${b} got ${a}`);
    process.exitCode = 1;
  } else {
    console.log(`OK   ${label}: ${a}`);
  }
}

console.log('PAYG_FEATURES keys:', PAYG_FEATURES.map(f => f.key).join(', '));

// Whisper examples (1 min)
assertEq('whisper gpt-4o 1min', computePaygChargeMru({ featureKey: 'whisper_studio', modelKey: 'gpt-4o-transcribe', minutes: 1 }), 0.48);
assertEq('whisper mini 2min', computePaygChargeMru({ featureKey: 'whisper_studio', modelKey: 'gpt-4o-mini-transcribe', minutes: 2 }), 0.48);

// Per-use examples
assertEq('flashcards 1 use', computePaygChargeMru({ featureKey: 'ai_flashcards', uses: 1 }), 0.62);
assertEq('course 1 use', computePaygChargeMru({ featureKey: 'ai_course', uses: 1 }), 0.81);
assertEq('summary pdf 1 use', computePaygChargeMru({ featureKey: 'ai_summary_pdf', uses: 1 }), 0.96);

