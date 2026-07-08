/**
 * Audit & Inspection module — seed question bank.
 *
 * Data captured from the reference deployment on 04-Jul-2026 (Audit Module
 * Specification, Appendix B) and cleansed per the FRD data-quality notes:
 *   - duplicate question dropped (B.2 #8/#9 "Mattress is firm and in good condition"),
 *   - negative phrasing normalized (B.2 #28 "Is Balcony Drain Clogged" →
 *     "Is the balcony drain free of clogging?"),
 *   - structural prefixes ("Maintenance Checklist – Room/Washroom:",
 *     "Balcony – Additional Checks:") moved into tags,
 *   - ★ mandatory marker converted to a structured `mandatory` flag,
 *   - ⓘ instruction/data-capture items typed as NUMERIC / TEXT / DATE /
 *     SIGNATURE / INSTRUCTION instead of overloaded ratings.
 *
 * Validated counts (sections / questions):
 *   - Property Audit:            11 / 141
 *   - Unit Lead Room check list:  1 /  27  (B.2 lists 28; duplicate dropped)
 *   - CX Audit:                  39 / 288
 *   - Total:                     51 / 456
 */

export type SeedQuestionType =
  | "YES_NO_NA"
  | "PASS_FAIL"
  | "RATING"
  | "SINGLE_CHOICE"
  | "MULTI_CHOICE"
  | "NUMERIC"
  | "TEXT"
  | "PHOTO"
  | "SIGNATURE"
  | "DATE"
  | "INSTRUCTION";

export interface SeedQuestion {
  prompt: string;
  type: SeedQuestionType; // RATING for normal checklist items (the default)
  weight: number;
  mandatory?: boolean;
  numericUnit?: string; // only for NUMERIC
  tags: string[];
}

export interface SeedSection {
  title: string;
  audience?: "resident-interview";
  questions: SeedQuestion[];
}

export interface SeedTemplate {
  name: string;
  auditType: "UL" | "CM" | "CX";
  targetType: "PROPERTY" | "ROOM";
  category: string;
  description: string;
  sections: SeedSection[];
}

// ---------------------------------------------------------------------------
// Internal builders (keep the 456-item data below terse and uniform).
// ---------------------------------------------------------------------------

interface ItemExtra {
  type?: SeedQuestionType;
  mandatory?: true;
  numericUnit?: string;
  tags?: string[]; // structural-prefix tags appended after [templateTag, sectionTag]
}

type Item = [prompt: string, weight: number, extra?: ItemExtra];

function section(
  templateTag: string,
  title: string,
  sectionTag: string,
  items: Item[],
  audience?: "resident-interview",
): SeedSection {
  return {
    title,
    ...(audience ? { audience } : {}),
    questions: items.map(([prompt, weight, extra = {}]) => ({
      prompt,
      type: extra.type ?? "RATING",
      weight,
      ...(extra.mandatory ? { mandatory: true } : {}),
      ...(extra.numericUnit ? { numericUnit: extra.numericUnit } : {}),
      tags: [
        templateTag,
        sectionTag,
        ...(extra.tags ?? []),
        ...(audience ? ["resident-interview"] : []),
      ],
    })),
  };
}

// ---------------------------------------------------------------------------
// Template 1 — Property Audit (B.1): 11 sections / 141 questions.
// Default weight where unmarked: 3.
// ---------------------------------------------------------------------------

const pa = (title: string, tag: string, items: Item[]) =>
  section("property-audit", title, tag, items);

const propertyAuditSections: SeedSection[] = [
  pa("Entrance-Reception", "entrance-reception", [
    ["Is the signage clean and in working condition?", 3],
    ["Are all CCTV cameras and recordings in working condition?", 5],
    ["Is the property entrance neat and clean at all times without any hindrance?", 3],
    ["Is the security gate clean and in working condition?", 3],
    ["Is staff (HK, SG, or Unit Lead) present to attend to visitors?", 3],
    ["Does the Reception have UniLiv Branded Umbrella?", 3],
    ["Are all log books neat, complete with all entries, and company-branded?", 3],
    ["Were you asked to show a valid ID card and record your details in the visitor register?", 3],
    ["Is the staff in uniform and well-groomed?", 3],
    ["Does the property have a grey rubber foot mat?", 3],
    ["Is the reception area odour-free and pleasantly fragranced?", 3],
    ["Is the biometric door closed and in working condition?", 3],
    ["Are fans, ACs, and coolers clean and in working condition?", 3],
    ["Is the area well-lit with no fused lights? (If natural light is adequate, is artificial light turned off?)", 3],
    ["Are all electrical switchboards clean?", 3],
    ["Are there no loose, hanging, or open wires, and are they properly covered?", 3],
    ["Are there no damaged collaterals present?", 3],
    ["Is there no sign of seepage or peeled-off paint in the reception area?", 3],
    ["Are no cobwebs visible?", 3],
    ["Is the floor clean and free of debris?", 3],
    ["Is the Unit Lead wearing the company uniform (T-shirts) and well-groomed?", 3],
    ["Is the Unit Lead well-versed with property facts?", 3],
    ["Is the reception furniture present, organized, and well-maintained?", 3],
    ["Does the first aid box contain valid items such as band-aids, Burnol, Dettol, cotton, and basic medicines?", 5],
    ["Is the emergency contact list (fire, ambulance, Unit Lead) available at the reception?", 3],
  ]),
  pa("Common Washroom", "common-washroom", [
    ["Is the washroom door working properly and lockable from the inside?", 3],
    ["Are the taps in working condition?", 3],
    ["Are the bathroom floor and walls clean?", 3],
    ["Is the bathroom mirror clean and free from cracks or hard water stains?", 3],
    ["Are the sink, toilet pot, and urinals clean and free from cracks or damage?", 3],
    ["Is the dustbin present in the bathroom and not overflowing?", 3],
  ]),
  pa("Common Area", "common-area", [
    ["Is the floor clean and free of debris?", 3],
    ["Are fans and lights in proper working condition?", 3],
    ["Is the television in working condition?", 3],
    ["Are there no signs of cobwebs?", 3],
    ["Are there no signs of seepage or peeled-off paint?", 3],
    ["Are there no loose hanging wires?", 3],
    ["Are all collaterals and frames undamaged?", 3],
    ["Is all recreational equipment in good working condition and undamaged?", 3],
    ["Is there no foul smell in the area?", 3],
    ["Are all electrical switchboards clean?", 3],
    ["Is the area well-lit with no fused lights? (If natural light is adequate, artificial lighting may be turned off)", 3],
    ["Is the housekeeping staff present and in complete uniform?", 3],
    ["Have you spoken to Residents? (At least 5 resident interactions; fill the form for each interaction — embedded link…)", 0, { type: "INSTRUCTION" }],
  ]),
  pa("Staircase", "staircase", [
    ["Is the staircase free of obstacles?", 3],
    ["Is the staircase clean, free of debris and dust?", 3],
  ]),
  pa("Corridors", "corridors", [
    ["Is the floor clean and free of debris?", 3],
    ["Are all lights working (not fused or flickering)?", 3],
    ["Is the area well lit with no fused lights? (If natural light is adequate, artificial lighting may be turned off)", 3],
    ["Are there no signs of cobwebs?", 3],
    ["Are there no signs of seepage or peeled-off paint?", 3],
    ["Are there no loose hanging wires?", 3],
    ["Are all collaterals and frames undamaged?", 3],
    ["Is there no foul smell in the area?", 3],
    ["Are there no dirty utensils present?", 3],
    ["Are garbage bins present on all floors, with no spills and closed lids?", 3],
    ["Are water dispensers in working condition?", 3],
    ["Are water jars covered?", 3],
    ["Are water dispensers clean?", 3],
    ["Are fire extinguishers present and not expired?", 3],
  ]),
  pa("CCTV", "cctv", [
    ["Are CCTV cameras installed at all entry/exit points and corridors?", 5],
    ["Are all CCTV cameras functional with recording enabled?", 5],
  ]),
  pa("Dining Area", "dining-area", [
    ["Are all electrical switchboards clean?", 3],
    ["Is the floor clean and free of debris?", 3],
    ["Are all lights working (not fused or flickering)?", 3],
    ["Is the area well lit (if natural light is adequate, is artificial lighting turned off)?", 3],
    ["Are there no cobwebs visible?", 3],
    ["Is there no seepage or peeled-off paint visible?", 3],
    ["Are there no loose wires hanging?", 3],
    ["Are all collaterals and frames undamaged?", 3],
    ["Is there no foul smell in the area?", 3],
    ["Are there no dirty utensils present?", 3],
    ["Are garbage bins available, with closed lids and no spills?", 3],
    ["Is the water dispenser in working condition?", 3],
    ["Are water jars covered?", 3],
    ["Is the water dispenser clean?", 3],
    ["Are fire extinguishers present and within the expiry date?", 3],
    ["Are there no signs of pests or flies?", 3],
    ["Is the fly catcher in working condition and switched on?", 3],
    ["Is the hand wash area kept clean?", 3],
    ["Is a soap dispenser present and filled?", 3],
    ["Are condiments (salt, pickle) kept in clean and presentable vessels?", 3],
    ["Are meal timings being followed and clearly displayed?", 3],
    ["Are hot plates clean and in working condition?", 3],
    ["Is the proper temperature of food maintained at all times?", 3],
    ["Is pantry staff present during meal timings?", 3],
    ["Is pantry staff well-groomed and wearing the company-provided uniform?", 3],
    ["Is pantry staff wearing aprons, gloves, and hair nets while serving?", 3],
    ["Do pantry staff have their meals before or after designated meal times?", 3],
    ["Are gloves or tongs used when handling ready-to-eat food?", 3],
    ["Is the weekly food menu displayed in the Resident Application, and does it match the food served?", 3],
    ["Is the wall behind appliance cabinets clean?", 3],
    ["Is the refrigerator in working condition?", 3],
    ["Are all electrical appliances clean and in working condition?", 3],
    ["Is air conditioning or exhaust functioning properly?", 3],
    ["Is sufficient tableware available and arranged properly (plates inverted, spoons, etc.)?", 3],
    ["Is the food cleared from the display after the meal time?", 3],
  ]),
  pa("Kitchen", "kitchen", [
    ["Is the kitchen always cleaned?", 3],
    ["Is there no water accumulated anywhere on the kitchen floor?", 3],
    ["Are there no insects in the kitchen?", 3],
    ["Is the kitchen staff always wearing headgear in the kitchen?", 3],
    ["Are the kitchen stove and utensils clean?", 3],
    ["Are the deep freezer and freezer clean?", 3],
    ["Are there no spiced food items or grocery packets left uncovered in the kitchen, and are all such items…", 3],
    ["Is the kitchen store always clean?", 3],
    ["Is there no food colour, kewra water, or rose water in the kitchen?", 3],
    ["Is paneer or any dairy product not kept in the freezer?", 3],
    ["Is the garbage bin always covered?", 3],
    ["Are only washed vegetables used?", 3],
    ["Is food not kept for more than 4 hours after cooking?", 3],
    ["Are the expiration dates of all kitchen items checked regularly?", 3],
    ["Are items used in the order they were received (first in, first out)?", 3],
    ["Is the temperature of the deep freezer and freezer checked and set appropriately?", 3],
  ]),
  pa("Room", "room", [
    ["Is the air conditioning working and clean (if applicable)?", 3],
    ["Are all fans working and clean?", 3],
    ["Is there no wall dampness or mould in the room?", 3],
    ["Are there no signs of rodent presence?", 3],
    ["Is the room number placed on the door and clearly visible?", 3],
    ["Are there no cobwebs or dust (including on furniture and windows)?", 3],
    ["Are all lights working (not fused or flickering)?", 3],
    ["Are curtains, bedsheets, and pillows with covers clean and placed properly?", 3],
    ["Is the main door working properly and can it be locked from inside?", 3],
    ["Is the room floor clean and free of litter after cleaning?", 3],
    ["Is a dustbin present in the room?", 3],
    ["Is the washroom door working properly and can it be locked from inside?", 3],
    ["Are taps and shower head in working condition?", 3],
    ["Are the bathroom floor and walls clean?", 3],
    ["Is the bathroom mirror clean (not broken or stained with hard water)?", 3],
    ["Are the sink and toilet pot clean (not cracked or broken)?", 3],
    ["Is a dustbin present in the bathroom?", 3],
    ["Is the balcony clean (no dirt, debris, or bird droppings)?", 3],
  ]),
  pa("Elevator", "elevator", [
    ["Is the elevator in working condition?", 3],
    ["Is the elevator clean, including panels and mirrors?", 3],
    ["Are emergency instructions and a valid lift safety certificate displayed inside?", 3],
  ]),
  pa("Terrace", "terrace", [
    ["Are extra items, if present, neatly stacked and protected from rain?", 3],
    ["Are terrace drains not blocked?", 3],
    ["Is the terrace clean and tidy?", 3],
    ["Is the terrace door locked (unless used as a common area – mark Not Applicable if so)?", 3],
    ["Is the overhead tank cover locked and in good condition?", 3],
    ["Is the overhead tank clean, with clear water (not cloudy)?", 3],
    ["Is the washing machine working without noise or leakage?", 3],
  ]),
];

// ---------------------------------------------------------------------------
// Template 2 — Unit Lead Room check list (B.2): 1 section / 27 questions.
// B.2 lists 28 items; the duplicate mattress item (#9) is dropped per FRD
// data-quality finding. Structural prefixes moved to tags. Balcony default
// weight: 4.
// ---------------------------------------------------------------------------

const MR: ItemExtra = { tags: ["maintenance-room"] };
const MW: ItemExtra = { tags: ["maintenance-washroom"] };
const BAL: ItemExtra = { tags: ["balcony"] };

const unitLeadSections: SeedSection[] = [
  section("ul-room", "Unit Lead Room Audit", "unit-lead-room-audit", [
    ["Is the Floor broomed?", 4],
    ["Is the Floor mopped?", 4],
    ["Is Dusting completed (all surfaces)?", 4],
    ["Is the Bed neatly made?", 4],
    ["Is the Washroom cleaned & sanitized?", 4],
    ["Main door functioning properly", 5, MR],
    ["Bed is stable and not loose", 5, MR],
    ["Mattress is firm and in good condition", 5, MR],
    ["Windows locking properly", 5, MR],
    ["Fan working properly", 6, MR],
    ["AC working properly", 6, MR],
    ["All lights functioning", 6, MR],
    ["Bookshelves securely fixed", 5, MR],
    ["Chair available and in working condition", 5, MR],
    ["Study desk available and stable", 5, MR],
    ["Does room have seepage issue", 7, MR],
    ["Washroom door locking properly", 5, MW],
    ["Cloth hook available on washroom door", 5, MW],
    ["WC functioning properly (no cracks/chips, proper drainage)", 5, MW],
    ["Wash basin in good condition (no cracks/chips, proper drainage)", 5, MW],
    ["Washroom lights working", 6, MW],
    ["Exhaust fan working properly", 6, MW],
    ["Shower functioning with proper water pressure", 5, MW],
    ["All taps working with adequate water pressure", 5, MW],
    ["Balcony door functioning properly", 4, BAL],
    ["Balcony area clean (if applicable)", 4, BAL],
    // Normalized from negative phrasing "Is Balcony Drain Clogged" (B.2 #28).
    ["Is the balcony drain free of clogging?", 4, BAL],
  ]),
];

// ---------------------------------------------------------------------------
// Template 3 — CX Audit (B.3): 39 sections / 288 questions.
// Default weight where unmarked: 5. Inline area prefixes ("Lounge floor — …")
// are descriptive and kept as part of the prompt.
// ---------------------------------------------------------------------------

const cx = (title: string, tag: string, items: Item[]) =>
  section("cx-audit", title, tag, items);

const cxInterview = (title: string, tag: string, items: Item[]) =>
  section("cx-audit", title, tag, items, "resident-interview");

const cxAuditSections: SeedSection[] = [
  cx("Rooms", "rooms", [
    ["Audit at least 1 room per floor using the Room Audit sheet (Sheet 2)", 0, { type: "INSTRUCTION" }],
    ["Note room numbers audited in Remarks", 1, { type: "TEXT" }],
    ["Were any critical failures found across sampled rooms?", 3],
  ]),
  cx("Approach", "approach", [
    ["Outside building — note time of arrival and weather conditions", 5, { type: "TEXT" }],
    ["Building facade — Is the building exterior facade clean and intact?", 5],
    ["Boundary wall — Is the boundary wall/gate intact and secure?", 5],
    ["Signage — Is Uniliv signage clean, lit, and in working condition?", 5],
    ["Parking area — Is parking area clean and organized?", 2],
    ["Parking area — Are bicycles/two-wheelers parked in marked spots?", 5],
    ["Parking area — Is parking area covered by CCTV?", 5],
    ["Parking register — Is parking allotment register maintained?", 5],
    ["Exterior lights — Is exterior lighting functional after sunset?", 5],
    ["Security gate — Is the security gate clean and in working condition?", 5],
    ["Security guard — Is security guard present at entry gate?", 5],
    ["Security guard — Did the guard ask for your ID and record visitor entry?", 5],
  ]),
  cx("Reception", "reception", [
    ["Entrance — Is the property entrance neat and clean without any hindrance?", 5],
    ["Entrance — Does the property have a grey rubber foot mat?", 5],
    ["Entry door — Is the biometric door closed and in working condition?", 5],
    ["Reception desk — Is staff (HK, SG, or Unit Lead) present to attend to visitors?", 5],
    ["Reception desk — Were you greeted with a smile?", 5],
    ["Reception desk — Is the staff in uniform and well-groomed?", 5],
    ["Reception desk — Is the Unit Lead wearing the company uniform and well-groomed?", 5],
    ["Reception desk — Is the Unit Lead well-versed with property facts?", 5],
    ["Visitor register — Are all log books neat, complete with all entries, and company-branded?", 5],
    ["Reception area — Is the reception area odour-free and pleasantly fragranced?", 5],
    ["Reception floor — Is the floor clean and free of debris?", 2],
    ["Reception furniture — Is the reception furniture present, organized, and well-maintained?", 5],
    ["Reception lighting — Is the area well-lit with no fused lights?", 5],
    ["Reception fans/AC — Are fans, ACs, and coolers clean and in working condition?", 2],
    ["Reception walls — Is there no sign of seepage or peeled-off paint?", 5],
    ["Reception walls — Are no cobwebs visible?", 5],
    ["Reception signage — Is the signage clean and in working condition?", 5],
    ["Branding — Is the Uniliv branding (logo, colors, posters) intact and unfaded?", 5],
    ["Switchboards — Are all electrical switchboards clean?", 5],
    ["Wiring — Are there no loose, hanging, or open wires?", 5],
    ["Collaterals — Are there no damaged collaterals present?", 5],
    ["CCTV — Are all CCTV cameras at entry working and recording?", 5],
    ["First aid box — Does the first aid box contain valid items within expiry?", 5],
    ["Emergency contacts — Is the emergency contact list (fire, ambulance, hospital, Unit Lead) available?", 5],
    ["Licenses display — Are valid licenses (Trade, FSSAI, Fire NOC, Police Verification) displayed?", 5],
    ["Evacuation map — Are evacuation route map and fire exit signage displayed and visible?", 5],
  ]),
  cx("Common Area", "common-area", [
    ["Lounge floor — Is the floor clean and free of debris?", 5],
    ["Lounge — Is there no foul smell in the area?", 5],
    ["Lounge — Are there no signs of cobwebs?", 5],
    ["Lounge walls — Are there no signs of seepage or peeled-off paint?", 5],
    ["Lounge lighting — Is the area well-lit with no fused lights?", 5],
    ["Lounge fans/lights — Are fans and lights in proper working condition?", 5],
    ["Lounge AC — Is air conditioning functioning and at comfortable temperature?", 5],
    ["Lounge TV — Is the television in working condition?", 5],
    ["Lounge seating — Are sofa/seating upholstery clean, intact, and stain-free?", 5],
    ["Recreation — Is all recreational equipment in good working condition?", 5],
    ["Lounge collaterals — Are all collaterals and frames undamaged?", 5],
    ["Lounge wiring — Are there no loose hanging wires?", 5],
    ["Lounge switchboards — Are all electrical switchboards clean?", 5],
    ["Lounge HK staff — Is the housekeeping staff present and in complete uniform?", 5],
  ]),
  cx("Dining", "dining", [
    ["Dining floor — Is the floor clean and free of debris?", 5],
    ["Dining — Is there no foul smell in the area?", 5],
    ["Are there no cobwebs visible?", 5],
    ["Dining walls — Is there no seepage or peeled-off paint visible?", 5],
    ["Dining lighting — Are all lights working (not fused or flickering)?", 5],
    ["Dining wiring — Are there no loose wires hanging?", 5],
    ["Dining switchboards — Are all electrical switchboards clean?", 5],
    ["Dining collaterals — Are all collaterals and frames undamaged?", 5],
    ["AC/exhaust — Is air conditioning or exhaust functioning properly?", 5],
    ["Hand wash area — Is the hand wash area kept clean?", 5],
    ["Hand wash area — Is a soap dispenser present and filled?", 5],
    ["Pest control — Are there no signs of pests or flies?", 5],
    ["Pest control — Is the fly catcher in working condition and switched on?", 5],
    ["Dirty utensils — Are there no dirty utensils present?", 5],
    ["Garbage bins — Are garbage bins available, with closed lids and no spills?", 5],
    ["Water dispenser — Is the water dispenser in working condition?", 5],
    ["Water dispenser — Is the water dispenser clean?", 5],
    ["Water jars — Are water jars covered?", 5],
    ["Fire extinguisher — Are fire extinguishers present and within expiry date?", 5],
    ["Hot plates — Are hot plates clean and in working condition?", 5],
    ["Food display — Is the proper temperature of food maintained at all times?", 5],
    ["Food display — Is the food cleared from the display after meal time?", 5],
    ["Condiments — Are condiments (salt, pickle) kept in clean and presentable vessels?", 5],
    ["Tableware — Is sufficient tableware available and arranged properly?", 5],
    ["Refrigerator — Is the refrigerator in working condition?", 5],
    ["Appliances — Are all electrical appliances clean and in working condition?", 5],
    ["Behind cabinets — Is the wall behind appliance cabinets clean?", 5],
    ["Meal timing — Are meal timings being followed and clearly displayed?", 5],
    ["Menu — Is the weekly food menu displayed in the Resident Application and matches food served?", 5],
    ["Food handling — Are gloves or tongs used when handling ready-to-eat food?", 5],
    ["FSSAI sample — Is food sample of the day preserved (FSSAI requirement) for 48 hrs?", 5],
    ["Pantry staff — Is pantry staff present during meal timings?", 5],
    ["Pantry staff — Is pantry staff well-groomed and wearing the company-provided uniform?", 5],
    ["Pantry staff — Is pantry staff wearing aprons, gloves, and hair nets while serving?", 5],
    ["Pantry staff — Do pantry staff have their meals before or after designated meal times?", 5],
  ]),
  cx("Kitchen", "kitchen", [
    ["Kitchen floor — Is the kitchen always cleaned?", 5],
    ["Kitchen floor — Is there no water accumulated anywhere on the floor?", 1],
    ["Are there no insects in the kitchen?", 5],
    ["Is the kitchen staff always wearing headgear in the kitchen?", 5],
    ["Do all kitchen staff have valid medical fitness certificates?", 5],
    ["Are the kitchen stove and utensils clean?", 5],
    ["Are the deep freezer and freezer clean?", 5],
    ["Is the temperature of the deep freezer and freezer set appropriately? (record °C)", 5, { type: "NUMERIC", numericUnit: "°C" }],
    ["Is paneer or any dairy product not kept in the freezer (only refrigerator)?", 5],
    ["Are there no spiced food items or grocery packets left uncovered?", 5],
    ["Is the kitchen store always clean?", 5],
    ["Are the expiration dates of all kitchen items checked regularly?", 5],
    ["Are items used in FIFO (first in, first out) order?", 5],
    ["Is there no food colour, kewra water, or rose water in the kitchen?", 5],
    ["Are only washed vegetables used?", 5],
    ["Is food not kept for more than 4 hours after cooking?", 5],
    ["Is the garbage bin always covered?", 5],
    ["Are dustbins segregated (wet/dry) and emptied at end of every shift?", 5],
    ["Is the LPG cylinder area secure, ventilated, and gas leakage detector installed?", 5],
    ["Is the kitchen chimney/exhaust cleaned and grease-free?", 5],
    ["Are knives and sharp tools stored safely and accounted for?", 5],
    ["Are pest control records up to date (last service within 30 days)?", 5],
  ]),
  cx("Corridors", "corridors", [
    ["Is the corridor floor clean and free of debris?", 5],
    ["Are all lights working (not fused or flickering)?", 5],
    ["Are there no signs of cobwebs?", 5],
    ["Are there no signs of seepage or peeled-off paint?", 1],
    ["Are there no loose hanging wires?", 5],
    ["Are all collaterals and frames undamaged?", 5],
    ["Is there no foul smell in the area?", 5],
    ["Are there no dirty utensils present in corridors?", 5],
    ["Are garbage bins present on all floors, with no spills and closed lids?", 5],
    ["Are water dispensers in working condition?", 3],
    ["Are water dispensers clean?", 5],
    ["Are water jars covered?", 5],
    ["Are fire extinguishers present, accessible, and not expired?", 3],
    ["Are smoke detectors/fire alarms installed and tested?", 5],
    ["Are emergency exit signs illuminated and exits unobstructed?", 5],
  ]),
  cx("Elevator", "elevator", [
    ["Is the elevator in working condition?", 4],
    ["Is the elevator clean, including panels and mirrors?", 4],
    ["Are emergency instructions and a valid lift safety certificate displayed inside?", 3],
    ["Is the elevator emergency alarm and intercom functional?", 5],
    ["Is the AMC contract for elevator current and last service logged?", 3],
  ]),
  cx("Study Room", "study-room", [
    ["Is the study room clean and free of clutter?", 2],
    ["Are study tables, chairs, and lighting in good condition?", 5],
    ["Are sufficient power sockets available and working at each desk?", 5],
    ["Is the AC/fan ventilation working?", 5],
    ["Is Wi-Fi signal strong in the study area? (record speed Mbps)", 5, { type: "NUMERIC", numericUnit: "Mbps" }],
    ["Are silence/study rules clearly displayed?", 5],
    ["Are bookshelves dust-free and books arranged properly?", 5],
  ]),
  cx("Laundry", "laundry", [
    ["Is the laundry area clean and dry?", 5],
    ["Are washing machines functional and free of leaks?", 5],
    ["Are drying lines/dryers in working condition?", 5],
    ["Is detergent/supplies stocked?", 5],
    ["Is the laundry register/booking system maintained?", 5],
    ["Are electrical safety standards maintained (no exposed wiring near water)?", 5],
  ]),
  cx("Terrace", "terrace", [
    ["Is the terrace door locked (unless used as common area — mark NA if common area)?", 5],
    ["Is the terrace clean and tidy?", 5],
    ["Are terrace drains not blocked?", 5],
    ["Are extra items neatly stacked and protected from rain? (mark NA if none)", 5],
    ["Is parapet wall height adequate (min 1m) and intact for safety?", 5],
    ["Is anti-bird netting/spikes intact where applicable? (mark NA if not installed)", 5],
    ["Is the overhead tank cover locked and in good condition?", 5],
    ["Is the overhead tank clean with clear water (last cleaning logged within 90 days)?", 5],
    ["Is the washing machine working without noise or leakage? (mark NA if not on terrace)", 5],
  ]),
  cx("Common Washroom", "common-washroom", [
    ["Is the washroom door working properly and lockable from the inside?", 5],
    ["Are the bathroom floor and walls clean?", 5],
    ["Is the bathroom mirror clean and free from cracks or hard water stains?", 5],
    ["Are the sink, toilet pot, and urinals clean and free from cracks?", 5],
    ["Are the taps in working condition?", 5],
    ["Are hand wash, soap dispenser, and tissues/hand dryer available and functional?", 5],
    ["Is the exhaust fan working and area free from dampness?", 5],
    ["Is the dustbin present and not overflowing?", 5],
    ["Is the cleaning checklist/log signed by housekeeping displayed?", 5],
  ]),
  cx("Wi-Fi", "wi-fi", [
    ["Wi-Fi speed test in lobby — record download Mbps", 5, { type: "NUMERIC", numericUnit: "Mbps" }],
    ["Wi-Fi speed test in farthest room — record download Mbps", 5, { type: "NUMERIC", numericUnit: "Mbps" }],
    ["Are Wi-Fi routers/access points placed correctly with no dead zones reported?", 5],
    ["Is router AMC/ISP contact displayed at reception?", 5],
  ]),
  cx("Water Supply", "water-supply", [
    ["Is RO/Water purifier functional and last filter change within 90 days?", 5],
    ["Is water pressure adequate in all wings/floors?", 5],
    ["Is drinking water TDS within acceptable range (test reading)?", 5, { type: "NUMERIC", numericUnit: "ppm" }],
  ]),
  cx("Documentation", "documentation", [
    ["Are Trade License, FSSAI, Fire NOC, Lift Safety Certificate all valid?", 5],
    ["Is the last fire drill within 6 months and first aid training within 12 months?", 5],
    ["All staff police verification on file?", 5],
    ["Are all AMCs (Pest, Lift, CCTV, Garbage) on file and active?", 5],
    ["Are water tank cleaning records (last 90 days) on file?", 5],
    ["Are all operational registers (visitor, in/out, complaint, work order, stock, asset) up to date?", 5],
    ["Are all resident KYC, agreements, police intimation, and consent documents on file?", 5],
  ]),
  cx("Room Condition", "room-condition", [
    ["Is there no wall dampness, mould, or seepage?", 4],
    ["Wall paint condition — free of graffiti, marks, peel-off?", 4],
    ["Is the room floor clean and free of litter?", 4],
    ["Are there no cobwebs or dust on ceilings/corners?", 4],
    ["Is the ceiling free of stains/damage?", 4],
    ["Are there no signs of rodent or pest activity?", 4],
  ]),
  cx("Furniture", "furniture", [
    ["Is the bed frame sturdy and free from damage?", 4],
    ["Is the mattress clean, no stains, no sagging?", 2],
    ["Are bedsheets, pillow covers, and blankets clean and laundered (no old/used linen)?", 4],
    ["Is the wardrobe sturdy with all shelves and locks working?", 4],
    ["Is the study table and chair in good condition?", 5],
    ["Are drawers, hooks, and shelves intact?", 3],
    ["Does room inventory match handover checklist?", 4],
    ["Is a dustbin present in the room (not placed in corridor)?", 5],
  ]),
  cx("Room Washroom", "room-washroom", [
    ["Is washroom door working and lockable from inside?", 3],
    ["Are taps and shower head in working condition?", 5],
    ["Are bathroom floor and walls clean?", 2],
    ["Is bathroom mirror clean (not broken or stained with hard water)?", 3],
    ["Are sink and toilet pot clean (not cracked or broken)?", 3],
    ["Is dustbin present and not overflowing?", 5],
    ["Is the exhaust fan working?", 5],
    ["Is hot water available?", 3],
    ["Is washroom drainage proper — no water clogging?", 5],
  ]),
  cxInterview("RESIDENT IDENTIFICATION", "resident-identification", [
    ["Resident Name (optional — can be anonymous)", 5, { type: "TEXT" }],
    ["Room Number", 5, { type: "TEXT", mandatory: true }],
    ["How long have you been staying here? (months)", 5, { type: "NUMERIC", numericUnit: "months" }],
    ["Room Type (Single, Double, Triple)", 5, { type: "TEXT" }],
  ]),
  cxInterview("AMENITIES & UTILITIES", "amenities-utilities", [
    ["Wi-Fi reliability and speed — rate 1 to 5", 5],
    ["Power backup (inverter/generator) — rate 1 to 5", 5],
    ["Water supply (pressure, hot water) — rate 1 to 5", 4],
    ["Laundry service — rate 1 to 5", 5],
    ["Study room/library (if available) — rate 1 to 5", 5],
    ["Gym/fitness area (if available) — rate 1 to 5", 5],
  ]),
  cx("Balcony", "balcony", [
    ["Is the balcony clean (no dirt, debris, bird droppings, old clothes/pillows)?", 5],
    ["Is balcony railing firm and at safe height?", 5],
    ["Is balcony drainage clear?", 5],
  ]),
  cx("Power Backup", "power-backup", [
    ["Is the generator & inverter functional (perform live switchover test)?", 4],
    ["Is generator fuel level adequate and refueling logged?", 4],
    ["Is the inverter battery health checked and last service logged?", 5],
  ]),
  cx("CCTV", "cctv", [
    ["Are CCTV cameras installed at all entry/exit points and corridors?", 5],
    ["Are all CCTV cameras functional with recording enabled?", 5],
    ["Is CCTV recording retention at least 30 days and verified on DVR/NVR?", 5],
    ["Is the DVR/NVR room locked and access controlled?", 4],
    ["Are DVR display monitors visible at the security desk?", 4],
  ]),
  cxInterview("OVERALL SATISFACTION", "overall-satisfaction", [
    ["Overall satisfaction with Uniliv — rate 1 to 5 (1=Very Poor … 5=Excellent)", 3],
    ["Would you recommend Uniliv to a friend or family member?", 3],
    ["Are you planning to renew/extend your stay?", 4],
  ]),
  cx("Staircase", "staircase", [
    ["Is the staircase free of obstacles?", 3],
    ["Is the staircase clean, free of debris and dust?", 4],
    ["Are staircase railings firm and not damaged?", 3],
    ["Is staircase well-lit and emergency lights functional?", 3],
  ]),
  cx("Gym", "gym", [
    ["Is gym area clean, ventilated, and odour-free?", 5],
    ["Are all equipment in working condition?", 5],
    ["Are equipment safety checks done and logged?", 5],
    ["Are gym rules and emergency contact displayed?", 5],
  ]),
  cx("Door Windows", "door-windows", [
    ["Is the room number placed on the door and clearly visible?", 5],
    ["Is the main door working properly and lockable from inside?", 5],
    ["Is door peephole/latch/chain working?", 5],
    ["Are windows operable and lockable?", 5],
    ["Are window grills intact and secure?", 5],
    ["Is mosquito netting present and intact?", 5],
    ["Are curtains/blinds clean and operable?", 5],
  ]),
  cxInterview("STAFF & SERVICE", "staff-service", [
    ["Do you feel physically safe in the property at all hours?", 5],
    ["Do you trust that your belongings are safe in your room?", 5],
    ["Is the entry/exit security process (biometric, guard) effective?", 5],
    ["Are CCTV cameras and security measures visible and working?", 5],
  ]),
  cx("Wrap-Up", "wrap-up", [
    ["Brief Unit Lead/Property Manager on key findings (preliminary)", 0, { type: "INSTRUCTION" }],
    ["Are any critical issues flagged for immediate action?", 5],
    ["Auditor signature", 5, { type: "SIGNATURE" }],
    ["Property Manager/Unit Lead signature acknowledging audit", 5, { type: "SIGNATURE" }],
    ["Note total audit duration (start time to end time)", 5, { type: "TEXT" }],
  ]),
  cxInterview("CLEANLINESS & MAINTENANCE", "cleanliness-maintenance", [
    ["Cleanliness of your room — rate 1 to 5", 5],
    ["Cleanliness of common areas (lounge, corridors, washrooms) — rate 1 to 5", 5],
    ["How quickly are maintenance issues fixed when you report them?", 5],
    ["Are there any maintenance issues currently unresolved in your room?", 5],
  ]),
  cxInterview("COMMUNITY & ENVIRONMENT", "community-environment", [
    ["Are house rules and curfews fair and reasonable?", 5],
    ["Do you feel this is a welcoming, friendly community?", 5],
    ["Are common areas available and not overcrowded?", 5],
    ["Are Uniliv events/activities held and enjoyable?", 5],
  ]),
  cx("Garbage", "garbage", [
    ["Is the main garbage collection point clean and pest-free?", 4],
    ["Is wet/dry garbage segregated at source?", 4],
    ["Is garbage disposal vendor contracted and pickup logged daily?", 5],
  ]),
  cx("Pest Control", "pest-control", [
    ["Is pest control service done within last 30 days (records available)?", 5],
    ["Are rodent traps placed and checked?", 5],
    ["No active signs of cockroaches, ants, lizards, or rodents anywhere?", 1],
  ]),
  cxInterview("Open Feedback", "open-feedback", [
    ["Top 1–3 things you LIKE most about Uniliv (auditor notes verbatim)", 1, { type: "TEXT" }],
    ["Top 1–3 things you want IMPROVED or FIXED urgently (auditor notes verbatim)", 2, { type: "TEXT" }],
    ["Is there anything else you want the management to know?", 2],
    ["Value for money — do you feel Uniliv is worth what you pay?", 1],
  ]),
  cx("Staff Check", "staff-check", [
    ["Pick 3–5 staff for spot interview (note names/roles in Remarks)", 0, { type: "INSTRUCTION" }],
    ["Are all spot-checked staff in clean Uniliv-branded uniform?", 5],
    ["Are all spot-checked staff wearing ID card/name badge?", 3],
    ["Do spot-checked staff know emergency contact numbers?", 4],
    ["Do spot-checked staff know property facts and escalation matrix?", 5],
    ["Behavior with residents observed — polite and respectful?", 5],
  ]),
  cxInterview("FOOD & DINING", "food-dining", [
    ["Quality of food/meals — rate 1 to 5", 4],
    ["Variety of the menu — rate 1 to 5", 4],
    ["Are meal timings convenient for you?", 4],
    ["Is the dining area clean and comfortable?", 4],
    ["Any specific food concerns or requests? (note in remarks)", 4, { type: "TEXT" }],
  ]),
  cx("Room Info", "room-info", [
    ["Room number/Bed number being audited", 5, { type: "TEXT" }],
    ["Resident name (if occupied)", 5, { type: "TEXT" }],
    ["Room type (single, double, triple)", 5, { type: "TEXT" }],
    ["Last housekeeping date (from log)", 5, { type: "DATE" }],
  ]),
  cx("Electricals", "electricals", [
    ["Are all lights working (not fused or flickering)?", 5],
    ["Are all power sockets functional and not loose? (test each)", 5],
    ["Are all fans working and clean?", 5],
    ["Is the AC working, clean, and filter cleaned within 30 days?", 4],
    ["Is the geyser working and electrical safety intact?", 5],
    ["Is Wi-Fi signal strong inside the room? (record speed Mbps)", 5, { type: "NUMERIC", numericUnit: "Mbps" }],
  ]),
  cxInterview("AVERAGE OVERALL SATISFACTION", "average-overall-satisfaction", [
    ["SAFETY RED FLAG — Did resident report feeling unsafe?", 1],
  ]),
];

// ---------------------------------------------------------------------------
// Exported templates.
// ---------------------------------------------------------------------------

export const SEED_TEMPLATES: SeedTemplate[] = [
  {
    name: "Property Audit",
    auditType: "CM",
    targetType: "PROPERTY",
    category: "Facility",
    description:
      "Full property facility inspection covering reception, common areas, corridors, dining, kitchen, rooms, elevator and terrace. Captured from the reference deployment (Appendix B.1).",
    sections: propertyAuditSections,
  },
  {
    name: "Unit Lead Room check list",
    auditType: "UL",
    targetType: "ROOM",
    category: "Housekeeping & Maintenance",
    description:
      "Per-room housekeeping and maintenance checklist for Unit Leads, covering room, washroom and balcony checks. Captured from the reference deployment (Appendix B.2), duplicate item removed.",
    sections: unitLeadSections,
  },
  {
    name: "CX Audit",
    auditType: "CX",
    targetType: "PROPERTY",
    category: "Customer Experience",
    description:
      "Customer-experience audit mixing facility inspection walk-through with resident-interview sections, from approach and reception through rooms, amenities, documentation and wrap-up. Captured from the reference deployment (Appendix B.3).",
    sections: cxAuditSections,
  },
];
