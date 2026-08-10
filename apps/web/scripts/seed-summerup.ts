import "dotenv/config";
import { pool } from "../src/server/db/client";
import { createMarket } from "../src/server/services/markets";

/**
 * The flagship SummerUp market: one categorical outcome per team.
 *
 * Roster captured from the SummerUp Hub team directory on 2026-08-10 — 113
 * teams in the public grid plus our own (the hub renders your team separately,
 * so it never appears as a card). The roster is reproduced in criteriaMd and
 * hashed at listing, which is the point: who was eligible is frozen with the
 * question, so a team added to the hub afterwards can't retroactively become a
 * valid answer.
 *
 * Close time defaults to the evening of the final day; override with
 * SUMMERUP_CLOSE_AT (any Date-parseable string, e.g. "2026-08-10T18:00+02:00").
 */
const TEAMS: { name: string; description?: string }[] = [
  { name: "PopOrSlop", description: "Prediction app for startups - poporslop.com" },
  { name: "NTA. - Nachteilsausgleich", description: "NTA helps children with dyslexia learn in a way that actually fits them, powered by AI." },
  { name: "GlowUP" },
  { name: "Growie", description: "Growth hacking AI" },
  { name: "shhh.date", description: "The future of independent escorting" },
  { name: "row.run", description: "GTM Agent Infrastructure" },
  { name: "Dhurandhar", description: "Online AI driven Chat" },
  { name: "VoxHello", description: "Voice agents for SMBs" },
  { name: "Governance School", description: "GS helps companies prepare employees to recognize risks early with full admin control and one-click compliance evidence" },
  { name: "El Compas", description: "El Compas is the global community platform for tango dancers, organizers and teachers." },
  { name: "Fluent", description: "An AI copilot for Headphones and Meta Glasses that whispers or shows missing words when you get stuck in a new language." },
  { name: "See<Food", description: "Counts calories in food and helps people keep to their diet" },
  { name: "EasyDPP", description: "EU Digital Product Passport provider for textile industry" },
  { name: "TrustLayer AI", description: "We are buildiung up AI security layer for AI governance enforcement, to help enterprises govern agents." },
  { name: "Pollen", description: "Pollen helps you sell anything effortlessly." },
  { name: "Makersclaw" },
  { name: "Leg Day", description: "Fitness motivation and tracking tool to overcome leg day" },
  { name: "JS" },
  { name: "docsight.de", description: "40M health questions hit ChatGPT daily, and every answer names one practice. DocSight gets German doctors cited" },
  { name: "Bakbakum Toys", description: "Speech therapy toys for children" },
  { name: "Ati" },
  { name: "Mia" },
  { name: "Tacit" },
  { name: "Ghazal" },
  { name: "ÆTHER:ZERO" },
  { name: "FempowerPolitics", description: "Infrastructure marketplace for political candidates & campaigns" },
  { name: "KlarZ AI", description: "KlarZ matches lab chemistry to real patient outcomes, so your platform stops guessing which product fits which patient." },
  { name: "ZweiDummeEinGedanke", description: "AI sales assistant for construction" },
  { name: "JxT" },
  { name: "Go", description: "Smart google map navigator agent" },
  { name: "#fitymi" },
  { name: "Cascabel Avionics (We need all skills)", description: "Make Long-Range Drones for Air-Logistics.We're transforming the air logistics industry from Manual to Automated." },
  { name: "EATRR", description: "We reduce consumer and retail food waste simultaneously" },
  { name: "Team Sterni" },
  { name: "Team x", description: "Yet to finalize" },
  { name: "Detective CallNon" },
  { name: "Better wearables.", description: "Personalizing health metrics with better sensors apis and inferences for sleep and exercise." },
  { name: "Aegisflow", description: "Coding agents cut software costs but demand enterprise control, verification, and auditing. We build that control layer." },
  { name: "Grobe", description: "B2C Real Estate Compliance platform for Energieausweis" },
  { name: "Evolve", description: "Preventive intelligence for Animals" },
  { name: "Bilano", description: "AI powered Bookkeeping as a service" },
  { name: "Crafti" },
  { name: "HCA" },
  { name: "AFF", description: "AI Agent Orchestration for Immigration" },
  { name: "InsightSync", description: "B2B Marketing Platform to win Enterprise Clients" },
  { name: "Anthrobot.ai", description: "Real estate cross border agent" },
  { name: "Team DG" },
  { name: "Quaesturia", description: "I'm building a digital CFO for the interface between startups and their investors" },
  { name: "Chris team", description: "AI workflow for commercial teams." },
  { name: "Diego" },
  { name: "Kalm", description: "We're building an AI native AirB&B rental property management software." },
  { name: "KitaReady", description: "Kita Application Tracker platform manages the applications in one place" },
  { name: "frdge rescue", description: "an Ai app to cook low calories food with ingredients that you vave in your fridge" },
  { name: "TheMarketThing", description: "Something with markets" },
  { name: "EATINGPAPERS", description: "A smart robot companion that teaches kids educational content playfully." },
  { name: "Aushelpy", description: "Helping foreigners in Germany navigate through bureacracy and life" },
  { name: "IKI", description: "IKI, a science-backed company helping people and teams improve performance through nervous system regulation." },
  { name: "RedditToGo" },
  { name: "SubletExpress", description: "SubletExpress turns messy rental posts into one clear dashboard." },
  { name: "Pownin", description: "Language learning companion" },
  { name: "MK 10", description: "Quick side hustle to make money for the week" },
  { name: "stickolo.", description: "Delightful sticker creation and fulfillment" },
  { name: "Rabbitune", description: "Rabbitune turns whatever song you're playing into the movie you should be watching tonight." },
  { name: "Keren: Event Flow Pro", description: "Event full funnel software from discovery through sales and deposit. For small to medium venues and small teams" },
  { name: "AI Agent Cost Control Tower", description: "We give companies a cost / spending control layer for their AI agents." },
  { name: "Lebi" },
  { name: "Sapiens Tech" },
  { name: "🍜 handpulled noodles", description: "We are making batzen" },
  { name: "Scale 1", description: "SteuerClara, B2C" },
  { name: "Asterisk", description: "-" },
  { name: "CallMeJob", description: "Getting you not only ready but perfect for your next job interview." },
  { name: "Pixel" },
  { name: "Tbc" },
  { name: "Shakeup - Tinder for brand deals", description: "Swipe. Match. Collab.The first mobile first Creator / Brand Marketplace in DACH / EU" },
  { name: "Azun", description: "Self paced growth tracking with AI! Personalized growth tracker with feedback and reinforcement learning!" },
  { name: "Eva Kolontai", description: "NeuroBusiness" },
  { name: "SteuerClara" },
  { name: "Praxista", description: "AI Reception & Patient Management for psychotherapists" },
  { name: "lalal" },
  { name: "JT Enterprise" },
  { name: "PROM", description: "The AI-native operating system for products" },
  { name: "yet to finalise" },
  { name: "TKNZ", description: "The app that can help people to survive in case of disaster" },
  { name: "Lulo Satellite" },
  { name: "Jesper'sBlackCerealBowl", description: "Trying to validate two B2C tangible, hardware ideas. High level, simple build." },
  { name: "Clustar", description: "Ai opretaring system for hospitality to handle fron office" },
  { name: "AIRA Law", description: "AI-native law firm for the music industry" },
  { name: "AMC", description: "I’m building AI Mission Control, a control layer for AI agents and automated workflows." },
  { name: "Qontact.me", description: "A privacy-first contact layer between you and the people trying to reach you." },
  { name: "Quallepink", description: "Social Media Agent for Personal Branding." },
  { name: "Tent" },
  { name: "SIPOZA" },
  { name: "RoboRanked" },
  { name: "BloodMark", description: "We analyze your blood Biomarkers with HomeKits" },
  { name: "Social Health Hub" },
  { name: "RotiQs", description: "Open-source robotics and control software for workflows where commercial automation costs too much — starting with labs." },
  { name: "Kaliber", description: "It is an AI-powered B2B marketplace" },
  { name: "CommandCanvas" },
  { name: "Regufill", description: "AI-Autofill Compliancequestionnaire" },
  { name: "Team", description: "info will be soon" },
  { name: "Co-Founder Matching", description: "68 people came here to find a co-founder. They all could use the app to find each other." },
  { name: "Phoxtail", description: "An agentic web framework" },
  { name: "ARca", description: "An interactive 3D record for every building, ready to be shown, measured, planned in, pitched or proven. + Other Ideas" },
  { name: "Autonomous-Talent", description: "Automating all boring parts of Talent & Recruitment" },
  { name: "GGD", description: "Business workflows" },
  { name: "Kantova", description: "We're building a local office ai box for quick information request, small delegations, transcription and dictation." },
  { name: "paul" },
  { name: "market101", description: "figuring it out" },
  { name: "Lebi.ai" },
  { name: "LastWrk" },
  { name: "Amelie", description: "blender" },
  { name: "takt", description: "Platz im Kopf, Planung in takt. Andere Apps tracken: Stillzeit, Windelwechsel, Schlaf. takt setzt mit euch um." },
  { name: "Kalina", description: "Dating tracking app - optimise. your romantic life" },
  { name: "Rescova" },
];

const CLOSE_AT = new Date(process.env.SUMMERUP_CLOSE_AT ?? "2026-08-10T18:00:00+02:00");

function criteria(): string {
  const roster = TEAMS.map(
    (t) => `- **${t.name}**${t.description ? ` — ${t.description}` : ""}`,
  ).join("\n");
  return [
    "Resolves to the team announced by the SummerUp organizers as the overall winner.",
    "",
    "The organizers' decision is final and there is no dispute window — this is an",
    "event market on a judged outcome, not a public-record market.",
    "",
    `Eligible teams (${TEAMS.length}), frozen at listing:`,
    "",
    roster,
    "",
    "If the organizers announce a winner that is not on this list, or announce no",
    "winner at all, the market is voided and every position is refunded at cost.",
  ].join("\n");
}

async function main() {
  if (Number.isNaN(CLOSE_AT.getTime())) throw new Error("SUMMERUP_CLOSE_AT is not a valid date");
  const names = TEAMS.map((t) => t.name);
  if (new Set(names).size !== names.length) throw new Error("duplicate team names in roster");

  const market = await createMarket({
    slug: "summerup-winner",
    title: "Which team wins SummerUp?",
    type: "EVENT_DEMO",
    outcomes: names,
    criteriaMd: criteria(),
    bPoints: 1000,
    closeAt: CLOSE_AT,
    positionCapPoints: 300,
    // Uniform prior: 113 teams we know nothing about, and one we're biased on.
    // Being honest about the bias is cheaper than pricing it in.
    mClass: 2,
  });
  console.log(`listed ${market.slug}: ${names.length} teams, closes ${CLOSE_AT.toISOString()}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
