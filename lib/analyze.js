import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.SPIDER_MODEL || "claude-opus-4-8";

export const DEMO_MODE = !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN;

const client = DEMO_MODE ? null : new Anthropic();

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_spider", "verdict_if_not_spider", "common_name", "scientific_name",
    "confidence", "nickname", "beauty", "power", "beauty_notes", "power_notes",
    "scouting_report", "fun_fact", "danger_to_humans",
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
    beauty: { type: "integer", description: "Beauty rating 0-100. Calibrate: 50 = average brown house spider, 80+ = genuinely striking (peacock spiders, ornate orb-weavers), under 30 = rough. Judge THIS individual: coloration, patterning, condition, pose, photo quality." },
    power: { type: "integer", description: "Power rating 0-100. Calibrate: 50 = average house spider. Weigh size, venom potency, hunting prowess, web engineering, intimidation factor. 90+ reserved for the true heavyweights." },
    beauty_notes: { type: "string", description: "One punchy sentence justifying the beauty score." },
    power_notes: { type: "string", description: "One punchy sentence justifying the power score." },
    scouting_report: { type: "string", description: "2-3 sentence hype-commentator scouting report on this spider as a league competitor. Reference visible details from the photo. Fun, confident, sports-broadcast energy." },
    fun_fact: { type: "string", description: "One genuinely interesting fact about this species." },
    danger_to_humans: { type: "string", enum: ["harmless", "mildly venomous", "medically significant"], description: "Real-world danger level of this species to humans." },
  },
};

const SYSTEM = `You are the Official Judge of SPIDER LEAGUE, a competitive league where friends submit photos of spiders they find and build teams. Your job: identify the spider and score it.

Rules of the bench:
- Identify the species as accurately as you can from the photo. Be honest about confidence.
- Beauty and Power are 0-100, calibrated so a plain brown house spider sits near 50 on both. Spread your scores; not everything is a 70.
- Judge the individual in THIS photo, not just the species: condition, coloration, size cues, pose, and photo quality all count.
- Voice: ringside sports commentator meets nature documentary. Fun and vivid, never mean-spirited toward the submitter.
- Only true spiders (order Araneae) compete. If the photo shows anything else (harvestman, tick, insect, a raisin, a shoe), set is_spider to false, identify what it is, still fill in the scores as a joke, and deliver the rejection with style in verdict_if_not_spider.
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
    beauty_notes: "Iridescent green chelicerae over jet-black velvet — the tuxedo of the arachnid world.",
    power_notes: "Pound for pound one of the great pouncers, but a flyweight on raw size.",
    scouting_report: "This kid has springs for legs and swagger for days. Watch the way it squares up to the lens — zero fear, all fundamentals. A crowd favorite in the making.",
    fun_fact: "Jumping spiders can leap over 10 times their body length and have some of the sharpest vision of any invertebrate.",
    danger_to_humans: "harmless",
  },
  {
    common_name: "European Garden Spider", scientific_name: "Araneus diadematus",
    nickname: "Cathedral Builder", beauty: 66, power: 55,
    beauty_notes: "That white cross marking reads like a family crest.",
    power_notes: "Mid-tier muscle, elite architecture — the web does the heavy lifting.",
    scouting_report: "A technician, not a brawler. Builds a textbook orb web overnight and lets geometry do the work. Quietly racks up wins while flashier spiders take the headlines.",
    fun_fact: "Orb-weavers eat and rebuild their entire web almost every day, recycling the silk proteins.",
    danger_to_humans: "harmless",
  },
  {
    common_name: "Giant House Spider", scientific_name: "Eratigena atrica",
    nickname: "The Bathtub Nightmare", beauty: 38, power: 72,
    beauty_notes: "All business, no glamour — fifty shades of basement brown.",
    power_notes: "One of the fastest sprinters in the amateur circuit; raw leg-span intimidation.",
    scouting_report: "You don't draft this one for looks. You draft it because it clocks half a meter per second across your kitchen floor and made your uncle scream. Pure power pick.",
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
