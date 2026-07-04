import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.SPIDER_MODEL || "claude-opus-4-8";

export const DEMO_MODE = !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN;

const client = DEMO_MODE ? null : new Anthropic();

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_spider", "verdict_if_not_spider", "common_name", "scientific_name",
    "confidence", "nickname", "headline_quote", "beauty", "power",
    "beauty_notes", "power_notes", "scouting_report", "fun_fact", "danger_to_humans",
  ],
  properties: {
    is_spider: {
      type: "boolean",
      description: "True only if the photo clearly shows a spider (order Araneae). Harvestmen, ticks, insects, and non-animals are false.",
    },
    verdict_if_not_spider: {
      type: "string",
      description: "If not a spider: what it actually is, plus one playful line rejecting the submission. Empty string if it is a spider.",
    },
    common_name: { type: "string", description: "Best-guess common name, e.g. 'Bold Jumping Spider'. If not a spider, name what it is." },
    scientific_name: { type: "string", description: "Best-guess species or genus, e.g. 'Phidippus audax'. Genus with 'sp.' if species unclear." },
    confidence: { type: "string", enum: ["low", "medium", "high"], description: "Identification confidence." },
    nickname: { type: "string", description: "A fight-night ring nickname for this individual spider, 1-4 words, e.g. 'The Basement Reaper'." },
    headline_quote: {
      type: "string",
      description: "The headline pull quote, attributed to the league's unnamed hype correspondent: a regular guy who is far too emotionally invested in this specific spider. One or two sentences. Oddly specific, weirdly personal, escalates fast, delivered with total sincerity. He talks about the spider like it owes him money, saved his marriage, or trains at his gym. No profanity, never mean to the submitter. Example energy: 'I've watched a lot of spiders and I'm telling you right now, this one has a plan for my house.'",
    },
    beauty: { type: "integer", description: "Beauty rating 0-100. Calibrate: 50 = average brown house spider, 80+ = genuinely striking (peacock spiders, ornate orb-weavers), under 30 = rough. Judge THIS individual: coloration, patterning, condition, pose, photo quality." },
    power: { type: "integer", description: "Power rating 0-100. Calibrate: 50 = average house spider. Weigh size, venom potency, hunting prowess, web engineering, intimidation factor. 90+ reserved for the true heavyweights." },
    beauty_notes: { type: "string", description: "One sentence in a formal arachnological register justifying the beauty score: reference specific visible morphology (setae, carapace sheen, patterning, leg banding, condition)." },
    power_notes: { type: "string", description: "One sentence in a formal arachnological register justifying the power score: reference size class, venom profile, predation strategy, or silk engineering." },
    scouting_report: { type: "string", description: "2-4 sentence formal specimen evaluation in the tone of a peer-reviewed field note: identification rationale, notable morphology visible in this photo, behavioral ecology of the species, and an assessment of this individual's condition. Precise, measured, scientific vocabulary. No hype." },
    fun_fact: { type: "string", description: "One genuinely interesting fact about this species." },
    danger_to_humans: { type: "string", enum: ["harmless", "mildly venomous", "medically significant"], description: "Real-world danger level of this species to humans." },
  },
};

const SYSTEM = `You are the evaluation desk of SPIDER LEAGUE, a competitive league where friends submit photos of spiders they find and build teams. Every submission gets two voices:

1. THE CHIEF ARACHNOLOGIST writes the identification, the scores, beauty_notes, power_notes, scouting_report, and fun_fact. Register: formal, precise, peer-review calm. Cite visible morphology. Be honest about identification confidence. Never hype.

2. THE HYPE CORRESPONDENT supplies only nickname and headline_quote. He is an ordinary man who is catastrophically over-invested in this particular spider. He speaks with complete sincerity, gets weirdly specific and personal, and escalates fast. He is never mean to the submitter and never uses profanity.

Scoring rules:
- Beauty and Power are 0-100, calibrated so a plain brown house spider sits near 50 on both. Spread your scores; not everything is a 70.
- Judge the individual in THIS photo, not just the species: condition, coloration, size cues, pose, and photo quality all count.
- Only true spiders (order Araneae) compete. If the photo shows anything else (harvestman, tick, insect, a raisin, a shoe), set is_spider to false, identify what it is, still fill in all fields as a joke, and deliver the rejection with style in verdict_if_not_spider.
- Include the real-world danger level so nobody free-handles a brown recluse for content.`;

/**
 * @param {string} base64 image data (no data: prefix)
 * @param {string} mediaType e.g. "image/jpeg"
 * @param {string} submitter handler's name
 */
export async function analyzeSpider(base64, mediaType, submitter) {
  if (DEMO_MODE) return mockAnalysis();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          {
            type: "text",
            text: `Handler "${submitter || "an anonymous handler"}" submits this creature for Spider League evaluation. Judge it.`,
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw Object.assign(new Error("The judge declined to evaluate this image."), { status: 422 });
  }
  if (response.stop_reason === "max_tokens") {
    throw Object.assign(new Error("The judge ran out of breath. Try again."), { status: 502 });
  }

  const text = response.content.find((b) => b.type === "text")?.text;
  const result = JSON.parse(text);
  result.beauty = clamp(result.beauty);
  result.power = clamp(result.power);
  return result;
}

function clamp(n) {
  return Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
}

// Demo mode: lets the site run end-to-end before an ANTHROPIC_API_KEY is configured.
const MOCK_SPIDERS = [
  {
    common_name: "Bold Jumping Spider", scientific_name: "Phidippus audax",
    nickname: "The Emerald Fang", beauty: 78, power: 61,
    headline_quote: "I made eye contact with this spider for four seconds and I have not been the same man since. It knows things about me.",
    beauty_notes: "Iridescent viridian chelicerae contrast sharply with dense black setae, presenting an unusually high-condition integument for a field specimen.",
    power_notes: "Salticid predation strategy relies on visually guided ballistic pouncing; formidable at scale, though absolute size class limits raw output.",
    scouting_report: "Dorsal patterning and chelicerae coloration are consistent with Phidippus audax. The specimen presents intact setae, full leg complement, and an alert posture oriented toward the lens — typical of the family's exceptional visual acuity. Behavioral ecology favors active diurnal hunting over web construction. Overall condition: excellent.",
    fun_fact: "Jumping spiders can leap over 10 times their body length and have some of the sharpest vision of any invertebrate.",
    danger_to_humans: "harmless",
  },
  {
    common_name: "European Garden Spider", scientific_name: "Araneus diadematus",
    nickname: "Cathedral Builder", beauty: 66, power: 55,
    headline_quote: "This spider built a whole web overnight while I couldn't even finish assembling one nightstand. I'm honestly considering asking it for help.",
    beauty_notes: "The dorsal cruciform maculation of guanine deposits is well defined, set against warm russet ground coloration in good condition.",
    power_notes: "A mid-weight orb-weaver whose principal armament is architectural: high-tensile silk deployed in a textbook two-dimensional snare.",
    scouting_report: "The cruciform dorsal markings identify this specimen as Araneus diadematus with high confidence. Abdominal volume suggests a well-fed adult female late in season. The species is a nocturnal web-rebuilder, recycling silk proteins daily. Condition of visible tarsi and web geometry indicates a healthy, established individual.",
    fun_fact: "Orb-weavers eat and rebuild their entire web almost every day, recycling the silk proteins.",
    danger_to_humans: "harmless",
  },
  {
    common_name: "Giant House Spider", scientific_name: "Eratigena atrica",
    nickname: "The Bathtub Nightmare", beauty: 38, power: 72,
    headline_quote: "My buddy saw this thing sprint across his kitchen and he moved. Sold the house. That's a fact and this spider did that.",
    beauty_notes: "Uniform earth-tone integument with minimal patterning; utilitarian morphology that scores low on ornamental criteria despite good condition.",
    power_notes: "Among the fastest sprinting araneomorphs recorded, with a leg span and pursuit speed that dominate the domestic bracket.",
    scouting_report: "Leg-to-body ratio and funnel-weaving context support identification as Eratigena atrica. The species is a sit-and-pursue predator capable of sprints approaching half a meter per second. This individual displays a full leg complement and robust carapace. An unglamorous but formidably athletic specimen.",
    fun_fact: "Giant house spiders held the Guinness record for fastest spider sprint until huntsman spiders took the title.",
    danger_to_humans: "harmless",
  },
];

let mockIndex = 0;
function mockAnalysis() {
  const pick = MOCK_SPIDERS[mockIndex++ % MOCK_SPIDERS.length];
  const jitter = (n) => clamp(n + Math.floor(Math.random() * 11) - 5);
  return {
    is_spider: true,
    verdict_if_not_spider: "",
    confidence: "medium",
    ...pick,
    beauty: jitter(pick.beauty),
    power: jitter(pick.power),
  };
}
