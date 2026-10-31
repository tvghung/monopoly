import { generateStartCandidates } from '../apps/server/src/game/powerUps/rewards.ts';
import { OFFICIAL_POWER_UP_REGISTRY } from '../apps/server/src/game/powerUps/catalog.ts';
import { POWER_UP_CATEGORIES, POWER_UP_CONFIG } from '../packages/shared/src/index.ts';

const seed = 0x0b10c2026;
const offerCount = 200_000;
let state = seed >>> 0;
const random = exclusiveMax => {
  state = (state + 0x6d2b79f5) >>> 0;
  let value = state;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  const unit = ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  return Math.floor(unit * exclusiveMax);
};

const rarityNames = Object.keys(POWER_UP_CONFIG.rarityWeights);
const counts = makeCounts();
const selectedCounts = makeCounts();
const definitionCounts = {};
const ingredientOutputCounts = Object.fromEntries(rarityNames.map(name => [name, 0]));
const selectedDefinitions = [];

function makeCounts() {
  return Object.fromEntries(POWER_UP_CATEGORIES.map(category => [category,
    Object.fromEntries(rarityNames.map(rarity => [rarity, 0]))]));
}

for (let index = 0; index < offerCount; index += 1) {
  const candidates = generateStartCandidates(random);
  for (const candidate of candidates) {
    const rarity = OFFICIAL_POWER_UP_REGISTRY.get(candidate.definitionId).rarity;
    counts[candidate.category][rarity] += 1;
  }
  const selected = candidates[random(candidates.length)];
  const selectedCard = { ...selected, rarity: OFFICIAL_POWER_UP_REGISTRY.get(selected.definitionId).rarity };
  selectedCounts[selectedCard.category][selectedCard.rarity] += 1;
  definitionCounts[selectedCard.definitionId] = (definitionCounts[selectedCard.definitionId] ?? 0) + 1;
  selectedDefinitions.push(selectedCard);
}

const rarityRank = Object.fromEntries(rarityNames.map((rarity, index) => [rarity, index]));
for (let index = 0; index < offerCount; index += 1) {
  let first = selectedDefinitions[random(selectedDefinitions.length)];
  while (first.rarity === 'LEGENDARY' || first.definitionId === 'U04') first = selectedDefinitions[random(selectedDefinitions.length)];
  let second = selectedDefinitions[random(selectedDefinitions.length)];
  while (second.rarity === 'LEGENDARY' || second.definitionId === 'U04') second = selectedDefinitions[random(selectedDefinitions.length)];
  const highest = Math.max(rarityRank[first.rarity], rarityRank[second.rarity]);
  const output = rarityNames[Math.min(highest + 1, rarityNames.length - 1)];
  ingredientOutputCounts[output] += 1;
}

const distribution = (values, total) => Object.fromEntries(Object.entries(values).map(([key, value]) => [
  key, { count: value, percent: Number((value * 100 / total).toFixed(3)) },
]));
const categoryOffers = Object.fromEntries(POWER_UP_CATEGORIES.map(category => [
  category, distribution(counts[category], offerCount),
]));
const categorySelections = Object.fromEntries(POWER_UP_CATEGORIES.map(category => [
  category, distribution(selectedCounts[category], offerCount),
]));
const totalRarities = Object.fromEntries(rarityNames.map(rarity => [
  rarity,
  Object.values(counts).reduce((sum, group) => sum + group[rarity], 0),
]));

console.log(JSON.stringify({
  method: 'Seeded START candidate generation using the production generateStartCandidates function; a separate uniform-choice scenario selects one of the three candidates per offer.',
  seed: `0x${seed.toString(16)}`,
  offers: offerCount,
  candidates: offerCount * POWER_UP_CATEGORIES.length,
  approvedRarityWeightsPercent: POWER_UP_CONFIG.rarityWeights,
  offeredRarityPercent: distribution(totalRarities, offerCount * POWER_UP_CATEGORIES.length),
  categoryOfferRarityPercent: categoryOffers,
  uniformChoiceScenario: {
    assumption: 'Each offered candidate is chosen with equal probability; this is a baseline sampling scenario, not observed player behavior.',
    selectedCategoryRarityPercent: categorySelections,
    topSelectedDefinitions: Object.fromEntries(Object.entries(definitionCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, count]) => [id, Number((count * 100 / offerCount).toFixed(3))])),
  },
  u04IngredientScenario: {
    assumption: 'Two independently sampled legal non-Legendary, non-U04 ingredients from the uniform-choice baseline; real players choose ingredients strategically.',
    sampledRecipes: offerCount,
    outputRarityPercent: distribution(ingredientOutputCounts, offerCount),
  },
}, null, 2));
