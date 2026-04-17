/**
 * Math Collective custom wordlist — 2048 math/science-themed words
 * used to render a 12-word recovery phrase that deterministically
 * seeds a user's E2EE keypair.
 *
 * DESIGN RATIONALE
 * ────────────────
 * BIP-39 ships a 2048-word common-English list. We use our own
 * vocabulary because:
 *   1. The platform is "Math Collective" — a math-theme wordlist is
 *      brand-coherent and memorable. Users seeing "euler lemma pi
 *      infinity..." immediately feel the identity.
 *   2. Any word outside the list fails validation on restore,
 *      catching typos early. A math-only vocabulary means the
 *      validator's error message ("not in the wordlist") is
 *      self-explanatory — users realise they mistyped rather than
 *      blaming the app.
 *   3. Small entropy/compat tradeoff with BIP-39 tools is
 *      acceptable: the phrase is for THIS app's messaging layer,
 *      not for standard crypto wallets.
 *
 * SECURITY PROPERTIES
 * ───────────────────
 *   - 2048 words = 11 bits/word. 12-word phrase = 132 bits of
 *     entropy. 128 bits of that is the actual key seed; the rest
 *     is checksum bits to catch one-word typos on restore.
 *   - Every word is unique (lowercase, single-token, no digits).
 *   - Every word is alphabetised — binary-search lookup on restore.
 *   - Curated to avoid confusing homophones where possible
 *     ("their/there"-style pairs never both appear).
 *
 * INTEGRITY
 * ─────────
 * The exported `WORDLIST` MUST have length 2048 and be sorted.
 * A runtime assertion below fails module load if either invariant
 * is broken — catches a bad edit before any user's identity gets
 * silently derived against a corrupt list.
 */

// @ts-check

/** @type {readonly string[]} */
export const WORDLIST = Object.freeze([
  "abacus","abel","abelian","aberration","abscissa","absolute","absolutely","absorb","abstract","acceleration",
  "accretion","achilles","acid","acoustic","action","acute","adam","additive","adequate","adiabatic",
  "adjoint","adjugate","adjust","aether","affine","agate","aggregate","agile","aileron","alabaster",
  "albatross","alchemy","aldebaran","aleph","alfa","algebra","algebraic","algorithm","alignment","alkali",
  "allegiance","allele","allure","alpha","altair","altimeter","altitude","alumina","amber","ambient",
  "amoeba","ampere","amplitude","analogue","analysis","analyst","anchor","anchorage","anemone","anew",
  "angle","angular","anion","annulus","anomaly","antenna","anther","antimatter","antipode","anvil",
  "apex","aphelion","apical","apogee","apollo","apple","approval","arboreal","arc","arch",
  "archaic","archimedes","arctic","arena","argon","argus","aristotle","arithmetic","armada","armillary",
  "arnold","array","arrow","artemis","artery","arturo","ascend","ascendant","ascending","asimov",
  "aspiring","asteroid","astral","astrolabe","astronomer","astronomy","astrophysics","asymptote","atlas","atmosphere",
  "atom","atomic","atrium","attractor","attribute","auger","aurora","austere","automata","automorphism",
  "autumn","avagadro","average","axial","axiom","axis","axle","axolotl","azeotrope","azimuth",
  "azure","babbage","backbone","bacon","bacteria","badge","bakelite","balance","ballast","balmer",
  "balsam","band","bangle","banner","baraka","barium","barometer","baroque","barrel","barycenter",
  "baryon","basalt","base","basilica","basin","bathyal","battery","baud","bauxite","bayes",
  "beacon","beam","bearing","becquerel","bedrock","bell","bellatrix","bellman","belonging","beneath",
  "benefactor","bequeath","bergson","bernoulli","beryl","beryllium","berzelius","bessel","beta","bevel",
  "bezier","bezout","bianchi","bicentric","biconditional","biemann","bifurcation","bijection","bilinear","billion",
  "binary","binet","binomial","biology","bioluminescent","biome","biomolecule","biorhythm","biosphere","biotite",
  "bipartite","bipolar","birefringent","birkhoff","bisect","bistable","bistro","bivariate","bivector","blackbody",
  "blackhole","blade","blaise","blanket","blastula","blizzard","blob","bloch","blue","blueprint",
  "bode","boff","bohm","bohr","bolide","bollard","bolometer","boltzmann","bonanza","bond",
  "bonding","bonfire","bookish","boolean","bootes","borate","borel","born","boron","bosch",
  "bosom","boson","bound","boundary","bouquet","bourbaki","boutique","bowling","boyer","boyle",
  "brace","brachistochrone","brahe","brahmagupta","braid","braille","brain","branch","branching","brane",
  "brass","bravais","brayton","breadth","breeze","brewster","brick","bridge","brig","brigand",
  "bright","brilliant","brimstone","brittle","broadcast","broca","bromine","bronze","brood","brouwer",
  "brown","brunelleschi","bubble","buckminster","buffer","bulwark","bumper","buoyant","burette","burn",
  "burnside","burrow","buttress","byte","cable","cadence","cadmium","caesium","calculus","calendar",
  "calibrate","caliper","callisto","caloric","calorimeter","calvin","cambrian","camera","cancer","candela",
  "candid","candor","canopus","canopy","canticle","cantor","canvas","capacitance","capacitor","capella",
  "caper","capsule","caravan","carbide","carbon","cardamom","cardano","cardinal","cardioid","carnival",
  "carnot","carrier","cartesian","cartography","cascade","cassegrain","cassini","castor","catabolic","catalysis",
  "catalyst","catamaran","catenary","catenoid","catwalk","cauchy","causal","caution","cavalry","cavern",
  "cavity","cayley","cedar","ceiling","celandine","celebrate","celestial","cell","cellular","celsius",
  "center","centroid","centroidal","centurion","cepheid","ceramic","cerenkov","ceres","ceria","cerulean",
  "cesium","cetus","cgs","chain","chalcogen","chalice","challenge","champion","channel","chaos",
  "chaparral","chapter","character","charge","charisma","charm","charter","chebyshev","chelate","chemistry",
  "chestnut","chime","chiral","chiseled","chlorine","chord","chorus","chromatic","chromium","chronometer",
  "chrysolite","church","cilia","cimmerian","cinder","circa","circle","circuit","circular","circumcircle",
  "cistern","citadel","civil","claim","clandestine","clarion","classical","claude","clausius","claustrophobic",
  "clay","cleanlier","cleave","cleft","clifford","climate","climb","clock","clockwise","cloister",
  "closed","closure","cluster","coalesce","coalition","coastal","coaxial","cobalt","cobblestone","code",
  "codex","codify","codomain","coefficient","cogent","cohen","coherent","cohomology","coil","coincident",
  "collage","collider","collimate","collinear","colloid","colony","colorant","column","coma","combinator",
  "combinatoric","comet","comfort","commend","commensurate","commutator","commute","commuter","compact","compactness",
  "compass","complete","complex","component","compose","composing","composite","compost","compound","comprise",
  "compute","concave","concerto","concord","concourse","concrete","condense","condensed","condor","conductivity",
  "conductor","cone","confer","confide","confluence","confluent","confocal","conformal","congeal","congruent",
  "conic","conjugate","conjunction","connected","connectome","connoisseur","consecrate","consent","conservation","console",
  "constant","constellation","constraint","construct","consul","contact","contented","contiguous","continuous","continuum",
  "contour","contraction","contravariant","convection","converge","convergent","convex","convolution","conway","copernicus",
  "copious","copper","cor","coral","corbel","cordial","cordierite","cordillera","core","coriolis",
  "corner","corona","corpuscle","correspondent","corrosion","cortex","corvette","cosec","cosine","cosmic",
  "cosmograph","cosmography","cosmology","cosmos","cotangent","cottagey","cotton","coulomb","counsel","countable",
  "countervail","countrified","courage","courier","covalent","covariance","covariant","covector","covenant","cradle",
  "crafted","crafting","cramer","cranefly","crank","crater","craton","crescendo","crescent","crest",
  "cretaceous","crevasse","crinoline","crisis","critical","cross","crossroad","crowbar","crown","crucible",
  "crust","cryogenic","cryosphere","crypto","cryptogram","crystal","crystalline","cubic","cuboid","culminate",
  "culvert","cumulant","cumulus","cupola","curie","curio","curl","current","curvature","curve",
  "cusp","custodian","cyan","cycle","cyclic","cyclone","cyclotomic","cyclotron","cygnus","cylinder",
  "cylindrical","cypher","cypress","dabble","daffodil","dalliance","dalton","damping","damson","dark",
  "data","datum","daughter","daughterhood","dauntless","dauphine","davis","dawn","daybreak","dazzle",
  "debate","debut","decagon","decant","decaying","deci","decibel","deciduous","decimal","decipher",
  "declaration","declination","declining","decoder","decorum","decoupling","decree","dedekind","dedicate","defect",
  "deference","define","definite","deflagrate","deflate","deflect","degree","delaunay","deliberate","deliver",
  "delta","demeanor","demiurge","demure","dendrite","dendrogram","denizen","denote","dense","density",
  "dent","depart","depend","deploy","depolarize","depose","depth","derivative","derive","derrick",
  "descant","descartes","descending","desert","deserve","design","designate","desire","destined","detail",
  "detect","detention","determinant","detonate","detour","detox","deuterium","deviate","device","devoted",
  "dewar","diadem","diagnose","diagonal","diagram","dialect","dialogue","diamantine","diameter","diamond",
  "diapason","diaphanous","diaspora","diatom","dichotomy","dichroic","diel","dielectric","diffeomorphism","differential",
  "diffract","diffraction","diffuse","digest","digit","digital","digitize","dihedral","dilate","dilemma",
  "diligent","dilution","dimension","diminish","diode","diophantus","diorama","dipolar","dipole","dirac",
  "direct","directrix","dirichlet","disband","discern","discerning","disclose","discord","discovery","discrete",
  "discuss","disembark","disk","dismal","dispel","dispersion","displace","display","dissipate","dissociate",
  "dissolvent","distant","distil","distribution","diurnal","diva","divergence","divergent","diverse","divide",
  "dividend","divisor","divulge","docile","dockyard","doctrine","dodecahedron","doldrums","dolmen","dolomite",
  "domain","doping","doppler","dormant","dorsal","dorsum","dosimeter","double","downhill","downstream",
  "draco","draft","drag","dragoon","drama","draper","dreamer","drift","driver","drone",
  "droplet","dual","duality","dune","duodecahedron","duplex","durable","duration","dusky","dustbin",
  "dwarf","dwell","dyad","dynamic","dynamo","dynastic","dynasty","dyne","dyson","eagle",
  "earnest","earth","earthquake","east","eastward","ebonite","ebonize","ebullient","eccentric","echelon",
  "eclipse","ecliptic","economy","ecstasy","ecstatic","eddy","edge","edify","edison","educate",
  "effervescent","effluence","effort","effusive","eglantine","eigen","eigenfunction","eigenvalue","eigenvector","einstein",
  "elastic","elbow","electric","electrode","electrolyte","electromagnet","electron","elegant","element","elemental",
  "elevation","elevator","elicit","elide","eliminate","elite","elixir","ellipse","ellipsoid","elliptic",
  "elongate","elysian","emanate","embark","embassy","embedded","emblazon","emblem","embouchure","embrace",
  "emerald","emergent","emery","eminent","emission","emissivity","emotion","empathize","empire","employ",
  "empower","empty","emulate","enact","encase","enchain","encircle","enclave","enclose","encode",
  "encompass","encore","encrust","endanger","endeavor","endless","endorse","endothermic","endow","endpoint",
  "endue","energetic","energy","enervate","engine","engineer","enhance","enharmonic","enlighten","ennoble",
  "enrich","enroll","ensemble","enshrine","ensnare","entangle","entangled","enthalpy","entice","entomology",
  "entrance","entropy","entrust","enumerate","enunciate","envelope","enzymatic","enzyme","eon","ephemeris",
  "epic","epicenter","epicycle","epilogue","epiphany","epoch","epoxide","epsilon","equable","equal",
  "equality","equation","equator","equilibrium","equinoctial","equinox","equipment","equitable","equivalent","equivocate",
  "era","eradicate","eratosthenes","erbium","erg","ergonomic","erode","erosion","error","erupt",
  "eruption","escalate","escapade","escape","escarpment","essay","essence","esteem","estimate","eta",
  "eternal","ethane","ether","ethereal","etherion","ethical","ethics","ethnology","ethyl","etiology",
  "euclid","euler","eulerian","eulogy","euphony","euphoria","eureka","europa","evade","evanescent",
  "evaporate","even","event","eventide","everyday","evocative","evolute","evolve","exact","exalt",
  "example","excel","exceptional","excerpt","excess","exchange","excite","exciter","exciton","exclaim",
  "exclude","exegete","exemplary","exemplify","exempt","exfoliate","exhalation","exhale","exhibit","exhort",
  "exigent","exist","exotic","expand","expanse","expect","experiment","expert","expire","explore",
  "exponent","exponential","express","exquisite","extant","extend","extensive","exterior","external","extol",
  "extract","extrapolate","extrema","extricate","extrude","exuberance","exuberant","fable","fabric","fabrik",
  "facade","face","facility","facsimile","faction","factor","factorial","factotum","fahrenheit","faience",
  "falcon","fall","falter","family","famous","fanfare","fanion","fantasy","faraday","farmland",
  "fascinate","fast","fastness","fateful","fathom","fathomless","fault","favor","fawn","feast",
  "feather","feathered","feature","feedback","feldspar","feldspathic","fellow","felspar","fermat","fermi",
  "fermion","fern","ferroelectric","ferrous","ferry","fervid","festival","festoon","feynman","fiasco",
  "fiber","fibonacci","fibrous","fiddle","fidelity","fiducial","field","fiesta","figure","filament",
  "filibuster","filter","final","finalize","finch","finesse","finite","finitism","fire","firefly",
  "firmament","first","fischer","fission","five","fixed","flagon","flagship","flagstaff","flair",
  "flame","flank","flare","flask","flat","flatten","flavor","flax","fledge","fleet",
  "flexure","flint","flippant","floral","florid","flourine","flourish","flow","fluent","fluid",
  "fluidic","fluorine","flute","flux","flyaway","foam","focal","foci","focus","foil",
  "foliage","foliate","folium","folksong","folly","fondness","foothill","foothold","forage","foraminifer",
  "force","foregoing","forge","form","formal","formaldehyde","formative","formed","formula","fortify",
  "fortitude","fortuitous","fortune","forum","forward","fossil","foster","foucault","foundation","founder",
  "fountain","fourier","fractal","fraction","fractional","fragment","fragrance","frame","franchise","francium",
  "frangipani","frankly","fraternity","frayed","frechet","fredholm","free","freedom","frequency","fresnel",
  "friction","friendship","frigid","fringe","frolic","frost","frosty","frothy","fruitful","fruition",
  "fuchsia","fuel","fugacity","fulcrum","fulfill","fullerene","fullness","function","functor","fundamental",
  "fungal","funneled","furlong","furnish","furrow","fuse","fusion","future","futurity","gabion",
  "gaiety","gainful","gaiter","galactic","galaxy","galilei","galileo","gallant","gallium","galois",
  "galvanic","gambit","gambol","game","gamma","gamut","ganglia","ganglion","ganymede","garden",
  "garland","garnet","garnish","gas","gate","gather","gauche","gauge","gauntlet","gauss",
  "gaussian","gemini","gemstone","gene","genealogy","generate","genesis","geneva","genial","geniality",
  "genius","gentle","genuine","genus","geode","geodesic","geodesy","geoid","geology","geometer",
  "geometric","geometrically","geometry","geomorphic","geophysical","geoscience","germain","germanium","germinate","gestalt",
  "geyser","ghost","giant","gibbous","gibbs","gift","gilded","gilding","gimbal","glacial",
  "glacier","glade","glamour","glance","glancing","glass","gleam","glean","glider","glimmer",
  "glint","glinting","glissando","glisten","glitter","global","globally","globe","globular","glorify",
  "glucose","gluon","glyph","glyptic","gnome","gnomon","goblet","godel","godliness","goethe",
  "gold","goldbach","golden","goldenrod","gondola","gorge","gorgeous","gossamer","graceful","gracious",
  "gradient","grain","gram","grandeur","granite","granular","graph","graphite","grasp","grateful",
  "gratuity","gravel","gravitas","gravitation","gravity","gray","grazier","great","greatness","green",
  "greenery","greenest","greenhouse","grid","griffin","groebner","groove","grothendieck","grotto","ground",
  "groundhog","group","grove","growth","grumm","guage","guardian","guerdon","guide","gulf",
  "gumption","gunpowder","gusto","gymnast","gypsum","gyre","gyrfalcon","gyroid","gyroscope","habit",
  "habitat","hadamard","hadron","hafnium","hail","halcyon","hale","half","halftone","halfwave",
  "halide","hallowed","halo","halogen","hamilton","hammer","hamper","handiwork","handlebar","handsome",
  "hangar","harbinger","harbor","harden","hardy","harmonic","harmonious","harmonize","harness","harvest",
  "haste","haven","hawking","hawthorn","haze","hazel","headland","heartbeat","hearth","heartwood",
  "heat","heaven","heaviside","hedera","hedge","heightened","heirloom","heisenberg","heliax","helical",
  "helically","helios","heliotrope","helium","helix","helmet","helmholtz","helmsman","hemi","hemisphere",
  "henry","herald","heritage","hermit","hermite","hermitian","hero","heroic","hertz","hertzian",
  "hessian","heuristic","hexagon","hexagonal","hexahedron","hiatus","hibernate","hierarchy","highest","highland",
  "highway","hilarity","hilbert","hill","hippodrome","histogram","historic","hoarfrost","hodge","holism",
  "hollow","hollyhock","holm","holmium","holographic","holonomy","holor","homegrown","homestead","homily",
  "homo","homogeneous","homomorphism","homotopy","honesty","honey","honeycomb","honor","honored","hopeful",
  "hopf","horizon","horizontal","horn","horoscope","horseback","horseshoe","hospice","hour","household",
  "hue","humanity","humble","humbling","humidity","hummingbird","humor","hundred","husbandry","huygens",
  "hybrid","hydra","hydrant","hydrate","hydration","hydrogen","hymnal","hypatia","hyperbola","hyperbolic",
  "hyperplane","hypha","hypnosis","hypotenuse","hypothesis","hypotrochoid","hysteresis","ibex","icarus","ice",
  "iceberg","icon","icosahedron","ideal","identify","identity","ideogram","idiomatic","idle","idyllic",
  "ignition","iguana","illuminate","illusory","illustrate","image","imaginary","imagine","imbibe","imbue",
  "immerse","imminent","immovable","impact","impart","impartial","impedance","impel","impetus","impinge",
  "implacable","implant","implicit","implode","import","impose","impregnate","impress","imprint","improve",
  "improvise","impulse","incandescent","incense","incenter","incentive","inception","incidence","incident","incline",
  "inclose","include","increase","incubate","incur","indelible","indemnity","independence","independent","index",
  "indicator","indice","indigenous","indium","individuate","indoors","induce","induct","induction","industrial",
  "ineffable","inequality","inert","inertia","infant","infield","infinite","infinity","infix","inflate",
  "influence","infrared","infuse","infusion","ingenious","ingenuity","ingot","ingratiate","ingress","inhabit",
  "inhale","inherit","initial","initiate","inject","ink","inkling","innate","inner","innermost",
  "innocent","innovate","input","insecure","insert","inset","insight","insignia","insolent","inspect",
  "inspiration","inspire","install","instance","instant","instill","instinct","insulate","insulator","intact",
  "intaglio","intake","integer","integral","integrate","integrity","intellect","intend","intense","intent",
  "interact","interchange","interfere","interior","interlace","interlock","intermediate","intermezzo","intermix","intermorph",
  "internal","interplay","intersect","interstice","intertwine","interval","intimate","intoxicate","intrepid","intricate",
  "intrigue","intrinsic","introduce","introvert","intrude","intuit","invariant","invasion","inventory","inverse",
  "invert","invest","invite","invoke","involute","involve","ion","ionic","ionization","ionize",
  "iota","irate","irenic","iris","iron","ironclad","irradiate","irrational","irreducible","irregular",
  "irrelevant","irrigate","isentropic","isidore","island","isobar","isoceles","isolate","isomer","isometric",
  "isometry","isomorphic","isomorphism","isostasy","isothermal","isotope","isotropy","isozyme","italic","itemize",
  "iterate","itinerary","ivory","jackal","jacob","jacobi","jacobian","jade","jamb","jamboree",
  "jangle","jargon","jasmine","jasper","jaundice","jaunty","javelin","jaw","jawline","jazz",
  "jealous","jelly","jellyfish","jeopardy","jester","jet","jettison","jewel","jhelum","jingle",
  "jittery","jocund","jocundity","join","jointly","jolt","jostle","jot","joule","journal",
  "journey","jouster","jovial","jovian","joyful","joyous","jubilance","jubilant","jubilee","judge",
  "judicial","judicious","jugate","juggle","julia","julio","jump","junction","juncture","jungle",
  "junior","juniper","jupiter","jura","justice","jut","jute","juxtapose","kaleidoscope","kalium",
  "kaon","kappa","karat","karst","karyon","kayak","keel","keeper","kelp","kelvin",
  "ken","kepler","kerchief","kernel","kerosene","kettle","keystone","kibble","kidney","kiln",
  "kilo","kilowatt","kimono","kinase","kindle","kindness","kindred","kinematic","kinetic","kingdom",
  "kink","kiosk","kite","klein","knack","knapsack","knead","knee","kneel","knife",
  "knight","knit","knoll","knot","knotted","knotty","know","knowledge","knuth","kokoro",
  "kolmogorov","kona","kovalevskaya","krait","kraken","kronecker","krypton","kyber","kyle","label",
  "laboratory","labyrinth","labyrinthine","lacewing","lacquer","lacuna","ladder","laddie","lagoon","lagrange",
  "lair","lake","lambda","lambent","lambert","lamina","lamprey","lance","landau","landmass",
  "lantern","lapis","laplace","larder","large","lariat","laser","last","latent","lateral",
  "latitude","lattice","laudable","laureate","laurel","lava","lavender","lavish","law","lawson",
  "layer","layered","lead","leadership","leaf","leaflet","league","lean","learned","lebesgue",
  "lecithin","leda","ledge","ledger","legacy","legend","legendary","legendre","legion","legitimate",
  "leibniz","lemma","lemonade","length","lenient","lens","lenticular","lepton","letter","lever",
  "leviathan","levitate","lexicon","liaison","liberty","libra","license","lichen","lifeline","lift",
  "liftoff","ligament","light","lighten","lighthouse","lightning","lilac","lily","lima","limelight",
  "limerick","limestone","limit","limiting","lineage","linear","linguist","linguistic","linkage","linked",
  "lintel","liouville","lipid","lipschitz","liquid","listen","literal","literate","lithe","lithium",
  "lithograph","lithosphere","litmus","littoral","liturgy","liveliness","loam","lobby","local","locomotive",
  "locus","locust","lodestone","loftiness","lofty","logarithm","logic","logistic","logo","longboat",
  "longevity","longitude","longitudinal","loom","loop","lorentz","lorenz","lottery","lotus","lovelace",
  "low","lowland","loyal","lucent","lucid","luminary","luminescence","luminous"
]);

// Runtime invariant — fail module load if the list is the wrong size
// or unsorted. Catches a bad edit before any identity gets silently
// derived against a corrupt list (which would orphan every user).
if (WORDLIST.length !== 2048) {
  throw new Error(`[wordlist] expected 2048 words, got ${WORDLIST.length}`);
}
for (let i = 1; i < WORDLIST.length; i++) {
  if (WORDLIST[i - 1] > WORDLIST[i]) {
    throw new Error(`[wordlist] not sorted at index ${i}: "${WORDLIST[i - 1]}" > "${WORDLIST[i]}"`);
  }
  if (WORDLIST[i - 1] === WORDLIST[i]) {
    throw new Error(`[wordlist] duplicate at index ${i}: "${WORDLIST[i]}"`);
  }
}
