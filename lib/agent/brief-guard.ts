const GENERIC_PRODUCT_PATTERNS = [
  /^(untitled concept|concept|app|ai app|tool|ai tool|service|platform|website|brand)$/i,
  /^(product|startup|project)$/i
] as const;

const GENERIC_AUDIENCE_PATTERNS = [
  /^(general audience|everyone|all users|users|people|customers)$/i,
  /^(b2c|b2b)$/i
] as const;

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function countWords(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

export type BriefGuardInput = {
  product: string;
  audience: string;
};

export type BriefHardBlockAssessment = {
  should_block: boolean;
  product_too_generic: boolean;
  audience_too_generic: boolean;
  missing_inputs: string[];
  followup_questions: string[];
  summary: string;
};

export function assessBriefHardBlock(input: BriefGuardInput): BriefHardBlockAssessment {
  const product = input.product.trim();
  const audience = input.audience.trim();
  const productWordCount = countWords(product);
  const audienceWordCount = countWords(audience);

  const productTooGeneric =
    product.length === 0 ||
    ((product.length < 3 || (product.length < 6 && productWordCount < 2)) &&
      GENERIC_PRODUCT_PATTERNS.some((pattern) => pattern.test(product.toLowerCase()))) ||
    GENERIC_PRODUCT_PATTERNS.some((pattern) => pattern.test(product.toLowerCase()));

  const audienceTooGeneric =
    audience.length === 0 ||
    ((audience.length < 3 || (audience.length < 6 && audienceWordCount < 2)) &&
      GENERIC_AUDIENCE_PATTERNS.some((pattern) => pattern.test(audience.toLowerCase()))) ||
    GENERIC_AUDIENCE_PATTERNS.some((pattern) => pattern.test(audience.toLowerCase()));

  const missingInputs = [
    ...(productTooGeneric ? ["product clarity"] : []),
    ...(audienceTooGeneric ? ["primary audience"] : [])
  ];

  const followupQuestions = uniqueStrings([
    ...(productTooGeneric ? ["What exactly are you building or launching, in one concrete sentence?"] : []),
    ...(audienceTooGeneric ? ["Who is the highest-priority audience for this first brand direction?"] : [])
  ]);

  const shouldBlock =
    (productTooGeneric && audienceTooGeneric) ||
    (product.length === 0 && audience.length === 0) ||
    productWordCount + audienceWordCount <= 1;

  return {
    should_block: shouldBlock,
    product_too_generic: productTooGeneric,
    audience_too_generic: audienceTooGeneric,
    missing_inputs: missingInputs,
    followup_questions: followupQuestions,
    summary: shouldBlock
      ? "Aurora needs at least one concrete anchor for both the product and the audience before concept generation."
      : "The brief has enough core anchors for Aurora to judge whether concept generation can start."
  };
}
