const adjectives = [
  'flying', 'happy', 'brave', 'clever', 'eager', 'gentle', 'jolly', 'kind',
  'lively', 'merry', 'nice', 'proud', 'silly', 'witty', 'zany', 'bright',
  'calm', 'daring', 'fancy', 'fierce', 'fresh', 'grand', 'quick', 'quiet',
  'shiny', 'sleek', 'smooth', 'swift', 'tall', 'wise', 'cool', 'warm',
  'bold', 'royal', 'noble', 'smart', 'sharp', 'strong', 'mighty', 'pure',
  'golden', 'silver', 'crystal', 'cosmic', 'stellar', 'lunar', 'solar', 'mystic',
  'magic', 'epic', 'super', 'mega', 'ultra', 'hyper', 'turbo', 'prime',
  'vivid', 'radiant', 'gleaming', 'blazing', 'glowing', 'sparkling', 'dazzling', 'brilliant'
];

const nouns = [
  'truck', 'boat', 'star', 'moon', 'sun', 'tree', 'bear', 'fox',
  'wolf', 'hawk', 'lion', 'tiger', 'eagle', 'dragon', 'phoenix', 'griffin',
  'ocean', 'river', 'mountain', 'valley', 'forest', 'desert', 'island', 'canyon',
  'storm', 'thunder', 'lightning', 'rainbow', 'aurora', 'comet', 'meteor', 'nebula',
  'crystal', 'diamond', 'ruby', 'emerald', 'sapphire', 'pearl', 'amber', 'jade',
  'knight', 'wizard', 'warrior', 'sage', 'guardian', 'champion', 'hero', 'legend',
  'wave', 'wind', 'flame', 'frost', 'shadow', 'light', 'dawn', 'dusk',
  'anchor', 'compass', 'beacon', 'torch', 'shield', 'sword', 'arrow', 'spear'
];

export function generateSlug(): string {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adjective}-${noun}`;
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length >= 3 && slug.length <= 50;
}
