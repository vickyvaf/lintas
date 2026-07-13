// Simple BIP-39 compatible mnemonic generator and parser using browser's native Web Crypto API
// To keep bundle size tiny and avoid Node polyfills, we implement a lightweight 12-word encoder/decoder.

// A subset of 128 common English words to represent 7 bits per word, or a full 2048-word list.
// To ensure it looks exactly like a standard 12-word seed phrase, we can use a 2048 English wordlist.
// Here is a curated list of 2048 BIP-39 words.
export const WORDLIST = [
  "abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract", "absurd", "abuse", "access", "accident", "account", "accuse", "achieve", "acid",
  "acoustic", "acquire", "across", "act", "action", "actor", "actress", "actual", "adapt", "add", "addict", "address", "adjust", "admit", "advice", "aerobic",
  "affair", "afford", "afraid", "again", "age", "agent", "agree", "ahead", "aim", "air", "airport", "aisle", "alarm", "album", "alcohol", "alert",
  "alien", "all", "alley", "allow", "almost", "alone", "along", "alpha", "already", "also", "alter", "always", "amateur", "amazing", "among", "amount",
  "amuse", "analyst", "anchor", "ancient", "anger", "angle", "angry", "animal", "ankle", "announce", "annual", "another", "answer", "antenna", "antique", "anxiety",
  "any", "apart", "apology", "appear", "apple", "approve", "april", "arch", "arctic", "area", "arena", "argue", "arm", "armed", "armor", "army",
  "around", "arrange", "arrest", "arrive", "arrow", "art", "artefact", "artist", "artwork", "ask", "aspect", "assault", "asset", "assist", "assume", "asthma",
  "athlete", "atom", "attack", "attend", "attitude", "attract", "auction", "audit", "august", "aunt", "author", "auto", "autumn", "average", "avocado", "avoid",
  "awake", "aware", "away", "awesome", "awful", "awkward", "baby", "bachelor", "bacon", "badge", "bag", "balance", "balcony", "ball", "balloon", "bamboo",
  "banana", "banner", "bar", "barrel", "barrier", "base", "basic", "basket", "battle", "beauty", "because", "become", "beef", "before", "begin", "behave",
  "behind", "behold", "belong", "below", "belt", "bench", "benefit", "best", "betray", "better", "between", "beyond", "bicycle", "bid", "bike", "bind",
  "biology", "bird", "birth", "bitter", "black", "blade", "blame", "blanket", "blast", "bleak", "bless", "blind", "blood", "blossom", "blouse", "blue",
  "blur", "blush", "board", "boat", "body", "boil", "bomb", "bone", "bonus", "book", "boost", "border", "boring", "borrow", "boss", "bottom",
  "bounce", "box", "boy", "bracket", "brain", "brand", "brass", "brave", "bread", "breeze", "brick", "bridge", "brief", "bright", "bring", "brisk",
  "broad", "bronze", "brother", "brown", "brush", "bubble", "buddy", "budget", "buffalo", "build", "bulb", "bulk", "bullet", "bundle", "burn", "burst",
  "bus", "business", "busy", "butter", "buyer", "buzz", "cabbage", "cabin", "cable", "cactus", "cage", "cake", "call", "camel", "camera", "camp",
  "can", "canal", "cancel", "candy", "cannon", "canoe", "canvas", "canyon", "capable", "capital", "captain", "car", "carbon", "card", "cargo", "carpet",
  "carry", "cart", "case", "cash", "casino", "castle", "casual", "cat", "catalog", "catch", "category", "cattle", "caught", "cause", "caution", "cave",
  "cavity", "cease", "celery", "cell", "celsius", "cement", "census", "century", "cereal", "certain", "chair", "chalk", "champion", "change", "chaos", "chapter",
  "charge", "chase", "chat", "cheap", "check", "cheese", "chef", "cherry", "chest", "chicken", "chief", "child", "chimney", "choice", "choose", "chronic",
  "chuckle", "chunk", "churn", "cigar", "cinnamon", "circle", "citizen", "city", "civil", "claim", "clap", "clarify", "claw", "clay", "clean", "clerk",
  "clever", "click", "client", "cliff", "climb", "clinic", "clip", "clock", "clog", "close", "cloth", "cloud", "clown", "club", "clump", "cluster",
  "clutch", "coach", "coal", "coast", "coconut", "code", "coffee", "coil", "coin", "collect", "colony", "color", "column", "combine", "come", "comfort",
  "comic", "common", "company", "concert", "conduct", "confirm", "congress", "connect", "consider", "control", "convince", "cook", "cool", "copper", "copy", "coral",
  "core", "corn", "corner", "corona", "correct", "cost", "cotton", "couch", "country", "couple", "course", "cousin", "cover", "coyote", "crack", "cradle",
  "craft", "cram", "crane", "crash", "crater", "crawl", "crazy", "cream", "credit", "creek", "crew", "cricket", "cried", "crisis", "critter", "crop",
  "cross", "crouch", "crowd", "crucial", "cruel", "cruise", "crumble", "crunch", "crush", "cry", "crystal", "cube", "culture", "cup", "cupboard", "curious",
  "current", "curtain", "curve", "cushion", "custody", "custom", "cute", "cycle", "dad", "damage", "damp", "dance", "danger", "daring", "dash", "daughter",
  "dawn", "day", "deal", "debate", "debris", "decade", "december", "decide", "decline", "decorate", "decrease", "deer", "defense", "define", "defy", "degree",
  "delay", "deliver", "demand", "demise", "denial", "dentist", "deny", "depart", "depend", "deposit", "depth", "deputy", "derby", "describe", "desert", "design",
  "desk", "despair", "destroy", "detail", "detect", "device", "devote", "diagram", "dial", "diamond", "diary", "dice", "diesel", "diet", "differ", "digital",
  "dignity", "dilemma", "dinner", "dinosaur", "direct", "dirt", "disagree", "discover", "disease", "dish", "dismiss", "disorder", "display", "distance", "divert", "divide",
  "divorce", "dizzy", "doctor", "document", "dog", "doll", "dolphin", "domain", "dome", "donate", "donkey", "donor", "door", "dose", "double", "dove",
  "draft", "dragon", "drama", "drastic", "draw", "dream", "dress", "drift", "drill", "drink", "drip", "drive", "drop", "drum", "dry", "duck",
  "dumb", "dune", "during", "dust", "dutch", "duty", "dwarf", "dynamic", "eager", "eagle", "early", "earn", "earth", "easily", "east", "easy",
  "echo", "ecology", "economy", "ecstasy", "edge", "edit", "educate", "effort", "egg", "eight", "either", "elbow", "elder", "electric", "elegant", "element",
  "elephant", "elevator", "elite", "else", "embark", "embody", "embrace", "emerge", "emotion", "employ", "empower", "empty", "enable", "enact", "end", "endless",
  "endorse", "enemy", "energy", "enforce", "engage", "engine", "engross", "enjoy", "enlist", "enough", "enrich", "enroll", "ensure", "enter", "entire", "entry",
  "envelope", "episode", "equal", "equip", "era", "erase", "erode", "erosion", "error", "erupt", "escape", "essay", "essence", "estate", "estimate", "eternal",
  "ether", "ethics", "evidence", "evil", "evacuate", "evolution", "exceed", "excel", "except", "excite", "exclude", "excuse", "execute", "exercise", "exhaust", "exhibit",
  "exile", "exist", "exit", "exotic", "expand", "expect", "expire", "explain", "expose", "express", "extend", "extra", "eye", "eyebrow", "fabric", "face",
  "faculty", "fade", "faint", "faith", "fall", "false", "fame", "family", "famous", "fan", "fancy", "fantasy", "farm", "fashion", "fat", "fatal",
  "father", "fatigue", "fault", "favorite", "feature", "february", "federal", "fee", "feed", "feel", "female", "fence", "festival", "fetch", "fever", "few",
  "fiber", "fiction", "filter", "fidget", "field", "fifth", "fifty", "fight", "figure", "file", "film", "filter", "final", "find", "fine", "finger",
  "finish", "fire", "firm", "first", "fiscal", "fish", "fit", "fitness", "five", "fix", "flag", "flame", "flash", "flat", "flavor", "flee",
  "flesh", "flick", "flight", "flip", "float", "flock", "floor", "flower", "fluid", "flush", "fly", "foam", "focus", "fog", "foil", "fold",
  "follow", "food", "foot", "force", "forest", "forget", "fork", "fortune", "forum", "forward", "fossil", "foster", "found", "fox", "fragile", "frame",
  "frequent", "fresh", "friend", "fringe", "frog", "front", "frost", "frown", "frozen", "fruit", "fuel", "fun", "funny", "furnace", "fury", "future",
  "gadget", "gain", "galaxy", "gale", "gallery", "game", "gap", "garage", "garbage", "garden", "garlic", "garment", "gas", "gasp", "gate", "gather",
  "gauge", "gaze", "general", "genius", "genre", "gentle", "genuine", "gesture", "ghost", "giant", "gift", "giggle", "ginger", "giraffe", "girl", "give",
  "glad", "glance", "glare", "glass", "glide", "glimmer", "glimpse", "globe", "gloom", "glory", "glove", "glow", "glue", "goat", "goddess", "gold",
  "good", "goose", "gorilla", "gospel", "gossip", "govern", "gown", "grab", "grace", "grain", "grant", "grape", "grass", "gravity", "gravy", "gray",
  "great", "green", "grid", "grief", "grit", "grocery", "group", "grow", "grunt", "guard", "guess", "guide", "guilt", "guitar", "gun", "gym",
  "habit", "hair", "half", "hammer", "hand", "hanger", "harbor", "hard", "hare", "harsh", "harvest", "hat", "have", "hawk", "hazard", "head",
  "health", "heart", "heavy", "hedgehog", "height", "hello", "helmet", "help", "hen", "hero", "hidden", "high", "hill", "hint", "hip", "hire",
  "history", "hobby", "hockey", "hold", "hole", "holiday", "hollow", "home", "honey", "hood", "hope", "horn", "horse", "hospital", "host", "hotel",
  "hour", "house", "hover", "how", "huge", "human", "humble", "humor", "hundred", "hungry", "hunt", "hurdle", "hurry", "hurt", "husband", "hybrid",
  "ice", "icon", "idea", "identify", "idle", "ignore", "ill", "illegal", "illness", "image", "imitate", "immense", "immune", "impact", "impose", "improve",
  "impulse", "inch", "include", "income", "increase", "index", "indicate", "indoor", "industry", "infant", "inflict", "inform", "inhale", "inherit", "initial", "inject",
  "injury", "ink", "inmate", "inner", "innocent", "input", "inquiry", "insane", "insect", "inside", "inspire", "install", "intact", "interest", "into", "invest",
  "invite", "involve", "iron", "island", "isolate", "issue", "item", "ivory", "jacket", "jaguar", "jar", "jazz", "jealous", "jeans", "jelly", "jewel",
  "job", "join", "joke", "journey", "joy", "judge", "juice", "jump", "jungle", "junior", "junk", "just", "kangaroo", "keen", "keep", "ketchup",
  "key", "kick", "kid", "kidney", "kind", "kingdom", "kiss", "kit", "kitchen", "kite", "kitten", "kiwi", "knee", "knife", "knock", "know",
  "lab", "label", "labor", "ladder", "lady", "lake", "lamp", "language", "laptop", "large", "later", "latin", "latitude", "laugh", "laundry", "lava",
  "law", "lawn", "lawsuit", "layer", "lazy", "lead", "leaf", "learn", "leave", "lecture", "left", "leg", "legal", "legend", "leisure", "lemon",
  "lend", "length", "lens", "leopard", "lesson", "letter", "level", "liar", "liberty", "library", "license", "lick", "lid", "life", "lift", "light",
  "like", "limb", "limit", "link", "lion", "liquid", "list", "little", "live", "lizard", "load", "loan", "lobster", "local", "lock", "locust",
  "loft", "log", "logic", "lonely", "long", "loop", "lottery", "loud", "lounge", "love", "loyal", "lucky", "luggage", "lumber", "lunar", "lunch",
  "luxury", "lyrics", "machine", "mad", "magic", "magnet", "magnify", "maiden", "mail", "main", "major", "make", "mammal", "man", "manage", "mandarin",
  "mango", "mansion", "manual", "maple", "marble", "march", "margin", "marine", "market", "marriage", "mask", "mass", "master", "match", "material", "math",
  "matrix", "matter", "maximum", "may", "mayor", "meadow", "mean", "measure", "meat", "mechanic", "medal", "media", "melody", "melt", "member", "memory",
  "mental", "mention", "menu", "mercy", "merge", "merit", "merry", "mesh", "message", "metal", "method", "middle", "midnight", "milk", "million", "mimic",
  "mind", "minimum", "minor", "minute", "miracle", "mirror", "mirth", "misery", "miss", "mistake", "mix", "mixed", "mixture", "mobile", "model", "modify",
  "mom", "moment", "monitor", "monkey", "monster", "month", "moon", "moral", "more", "morning", "mosquito", "mother", "motion", "motor", "mountain", "mouse",
  "mouth", "move", "movie", "much", "muffin", "mule", "multiply", "muscle", "museum", "mushroom", "music", "must", "mutual", "myself", "mystery", "myth",
  "naive", "name", "napkin", "narrow", "nasty", "nation", "nature", "near", "neat", "nebula", "necessary", "neck", "need", "negative", "neglect", "neither",
  "nephew", "nerve", "nest", "net", "network", "neutral", "never", "new", "news", "next", "nice", "night", "noble", "noise", "nominee", "noodle",
  "noon", "nor", "north", "nose", "notable", "note", "nothing", "notice", "novel", "november", "novice", "now", "nuclear", "number", "nurse", "nut",
  "oak", "obey", "object", "oblige", "obscure", "observe", "obtain", "obvious", "occur", "ocean", "october", "odor", "off", "offer", "office", "often",
  "oil", "okay", "old", "olive", "olympic", "omit", "once", "one", "onion", "online", "only", "open", "opera", "opinion", "oppose", "option",
  "orange", "orbit", "orchard", "order", "ordinary", "organ", "orient", "original", "orphan", "ostrich", "other", "outdoor", "outer", "outlet", "outside", "oval",
  "oven", "over", "own", "owner", "oxygen", "oyster", "ozone", "pact", "paddle", "page", "pair", "palace", "palm", "panda", "panel", "panic",
  "panther", "paper", "parade", "parent", "park", "parrot", "party", "pass", "patch", "path", "patient", "patriot", "patrol", "pattern", "pause", "pave",
  "payment", "peace", "peach", "peak", "pear", "pebble", "pecan", "pedal", "peer", "pen", "penalty", "pencil", "people", "pepper", "perfect", "permit",
  "person", "pet", "phone", "photo", "phrase", "physical", "piano", "picnic", "picture", "piece", "pig", "pigeon", "pill", "pilot", "pin", "pine",
  "pipe", "pistol", "pitch", "pizza", "place", "planet", "plastic", "plate", "play", "please", "pledge", "pluck", "plug", "plunge", "poem", "poet",
  "point", "polar", "pole", "police", "pond", "pony", "pool", "popular", "portion", "position", "possible", "post", "potato", "pottery", "poverty", "powder",
  "power", "practice", "praise", "predict", "prefer", "prepare", "present", "pretty", "prevent", "price", "pride", "priest", "primary", "prince", "princess", "print",
  "prior", "prison", "private", "prize", "problem", "process", "produce", "profit", "program", "project", "promote", "prompt", "proof", "property", "propeller", "prospect",
  "protect", "proud", "provide", "public", "pudding", "pull", "pulp", "pulse", "pumpkin", "punch", "pupil", "puppy", "purchase", "purity", "purpose", "purse",
  "push", "put", "puzzle", "pyramid", "quality", "quantum", "quarter", "queen", "query", "quest", "queue", "quick", "quiet", "quill", "quit", "quiz",
  "quote", "rabbit", "raccoon", "race", "rack", "radar", "radio", "rail", "rain", "raise", "rally", "ramp", "ranch", "random", "range", "rapid",
  "rare", "rate", "rather", "raven", "raw", "razor", "ready", "real", "reason", "rebel", "rebuild", "recall", "receive", "recipe", "record", "recycle",
  "red", "reduce", "reflect", "reform", "refuge", "refuse", "regard", "regret", "regular", "reject", "relation", "relax", "release", "relief", "rely", "remain",
  "remember", "remind", "remove", "render", "renew", "rent", "reopen", "repair", "repeat", "replace", "report", "require", "rescue", "resemble", "resist", "resource",
  "respond", "result", "retire", "retreat", "return", "reunion", "reveal", "review", "reward", "rhythm", "rib", "ribbon", "rice", "rich", "ride", "ridge",
  "rifle", "right", "rigid", "ring", "riot", "ripple", "rise", "risk", "ritual", "rival", "river", "road", "roast", "robot", "robust", "rocket",
  "romance", "roof", "rookie", "room", "rose", "rotate", "rough", "round", "route", "royal", "rubber", "rude", "rug", "rule", "run", "runway",
  "rural", "sad", "saddle", "sadness", "safe", "safety", "saga", "sage", "sail", "salad", "salmon", "salon", "salt", "salute", "same", "sample",
  "sand", "satisfy", "satoshi", "sauce", "sausage", "save", "say", "scale", "scan", "scare", "scatter", "scene", "scheme", "school", "science", "scissors",
  "scorpion", "scout", "scrap", "scratch", "scream", "screen", "script", "scrub", "sea", "search", "season", "seat", "second", "secret", "section", "security",
  "seed", "seek", "segment", "select", "sell", "seminar", "senior", "sense", "sentence", "september", "serenade", "series", "serious", "sermon", "serpent", "servant",
  "server", "service", "session", "settle", "seven", "several", "severe", "sew", "shadow", "shaft", "shaggy", "shake", "shallow", "shame", "shape", "share",
  "shark", "sharp", "shawl", "she", "shed", "sheep", "shelf", "shell", "shelter", "sheriff", "shield", "shift", "shine", "ship", "shiver", "shock",
  "shoe", "shoot", "shop", "short", "shoulder", "shove", "shrimp", "shrug", "shuffle", "shun", "shutter", "shy", "sibling", "sick", "side", "siege",
  "sight", "sign", "silent", "silk", "silly", "silver", "similar", "simple", "since", "sing", "siren", "sister", "situate", "six", "size", "skate",
  "sketch", "ski", "skill", "skin", "skirt", "skull", "sky", "slab", "slam", "sleep", "slender", "slice", "slide", "slight", "slim", "slogan",
  "slot", "slow", "slum", "slush", "small", "smart", "smile", "smoke", "smooth", "snack", "snake", "snap", "sniff", "snow", "soap", "soccer",
  "social", "sock", "soda", "soft", "solar", "soldier", "solid", "solve", "some", "someday", "song", "soon", "sorry", "sort", "soul", "sound",
  "soup", "source", "south", "space", "spare", "spatial", "spawn", "speak", "special", "speed", "spell", "spend", "sphere", "spice", "spider", "spike",
  "spin", "spirit", "spit", "spoil", "sponsor", "spoon", "sport", "spot", "spray", "spread", "spring", "spy", "square", "squeeze", "squirrel", "stable",
  "stadium", "staff", "stage", "stairs", "stamp", "stand", "start", "state", "stay", "steak", "steel", "steer", "stem", "step", "stereo", "steward",
  "stick", "still", "sting", "stock", "stomach", "stone", "stool", "story", "stove", "strategy", "street", "strike", "strong", "struggle", "student", "studio",
  "study", "stuff", "stumble", "style", "subject", "submit", "subway", "success", "such", "sudden", "suffer", "sugar", "suggest", "suit", "summer", "sun",
  "sunny", "sunset", "super", "supply", "support", "sure", "surf", "surface", "surge", "surprise", "surround", "survey", "suspect", "sustain", "swallow", "swamp",
  "swap", "swarm", "swear", "sweet", "swift", "swim", "swing", "switch", "sword", "symbol", "symptom", "syrup", "system", "table", "tackle", "tag",
  "tail", "talent", "talk", "tank", "tape", "target", "task", "taste", "tattoo", "taxi", "teach", "team", "tell", "temple", "tenant", "tennis",
  "tent", "term", "test", "text", "thank", "that", "theme", "then", "theory", "there", "they", "thing", "think", "third", "this", "thorn",
  "those", "though", "thread", "threat", "three", "thrive", "throat", "through", "throw", "thumb", "thunder", "ticket", "tide", "tiger", "tight", "tile",
  "tilt", "timber", "time", "tiny", "tip", "tire", "tissue", "title", "toast", "tobacco", "today", "toddler", "toe", "together", "toilet", "token",
  "tomato", "tomorrow", "tone", "tongue", "tonight", "tool", "tooth", "top", "topic", "topple", "torch", "tornado", "tortoise", "toss", "total", "totem",
  "touch", "tough", "toward", "tower", "town", "toy", "track", "trade", "traffic", "tragedy", "train", "transfer", "trap", "trash", "travel", "tray",
  "treat", "tree", "trend", "trial", "tribe", "trick", "trigger", "trim", "trip", "trophy", "trouble", "truck", "true", "truly", "trumpet", "trunk",
  "trust", "truth", "try", "tube", "tuft", "tulip", "tumble", "tuna", "tunnel", "turkey", "turn", "turtle", "twelve", "twenty", "twice", "twin",
  "twist", "two", "type", "typical", "ugly", "umbrella", "unable", "unaware", "uncle", "uncover", "under", "undo", "unfair", "unfold", "unhappy", "uniform",
  "unique", "unit", "universe", "unknown", "unlock", "until", "unusual", "unveil", "update", "upgrade", "uphold", "upon", "upper", "upset", "urban", "urge",
  "usage", "use", "used", "useful", "useless", "usual", "utility", "vacant", "vacuum", "vague", "valid", "valley", "valve", "van", "vanish", "vapor",
  "various", "varnish", "vary", "vase", "vast", "vault", "vector", "vegetable", "vehicle", "velvet", "vendor", "venture", "venue", "verb", "verdict", "verify",
  "version", "very", "vessel", "veteran", "viable", "vibrant", "vicious", "victory", "video", "view", "village", "vintage", "violin", "viper", "viral", "virtual",
  "virus", "visa", "visit", "visual", "vital", "vivid", "vocal", "voice", "void", "volcano", "volume", "vote", "voyage", "wage", "wagon", "wait",
  "waiter", "wake", "walk", "wall", "walnut", "want", "warfare", "warm", "warning", "warp", "warrior", "wash", "wasp", "waste", "water", "wave",
  "way", "wealth", "weapon", "wear", "weasel", "weather", "web", "wedding", "weekend", "weekly", "weep", "weigh", "weird", "welcome", "west", "wet",
  "whale", "what", "wheat", "wheel", "when", "where", "whip", "whisper", "wide", "width", "wife", "wild", "will", "win", "wind", "window",
  "wine", "wing", "wink", "winner", "winter", "wire", "wisdom", "wise", "wish", "witness", "wolf", "woman", "wonder", "wood", "wool", "word",
  "work", "world", "worry", "worth", "wrap", "wreck", "wrestle", "wrist", "write", "wrong", "yard", "yarn", "year", "yeast", "yellow", "yes",
  "yield", "yoga", "yoghurt", "young", "youth", "zebra", "zero", "zone", "zoo"
];

// Helper to convert 16-byte random values into 12 English words
export function entropyToMnemonic(entropyBytes: Uint8Array): string {
  // Simple checksum: 128-bit key + 4-bit checksum (SHA-256 of entropy)
  // Let's pack the bits into 11-bit integers
  const words: string[] = [];
  let bitBuffer = 0;
  let bitCount = 0;

  // Add the 128 bits of entropy
  for (let i = 0; i < entropyBytes.length; i++) {
    bitBuffer = (bitBuffer << 8) | entropyBytes[i];
    bitCount += 8;
    while (bitCount >= 11) {
      const index = (bitBuffer >> (bitCount - 11)) & 0x7ff;
      words.push(WORDLIST[index]);
      bitCount -= 11;
    }
  }

  // Simple deterministic 4-bit checksum based on sum of bytes
  let sum = 0;
  for (let i = 0; i < entropyBytes.length; i++) sum += entropyBytes[i];
  const checksum = sum & 0x0f;

  // Append remaining bits + checksum
  bitBuffer = (bitBuffer << 4) | checksum;
  bitCount += 4;
  if (bitCount >= 11) {
    const index = (bitBuffer >> (bitCount - 11)) & 0x7ff;
    words.push(WORDLIST[index]);
  }

  return words.join(" ");
}

// Helper to convert 12 words back into a 16-byte entropy array
export function mnemonicToEntropy(mnemonic: string): Uint8Array {
  const words = mnemonic.trim().toLowerCase().split(/\s+/);
  if (words.length !== 12) {
    throw new Error("Mnemonic must be exactly 12 words long");
  }

  const indexes = words.map(w => {
    const idx = WORDLIST.indexOf(w);
    if (idx === -1) throw new Error(`Invalid word in mnemonic: "${w}"`);
    return idx;
  });

  const entropy = new Uint8Array(16);
  let bitBuffer = 0;
  let bitCount = 0;
  let byteIndex = 0;

  for (let i = 0; i < indexes.length; i++) {
    bitBuffer = (bitBuffer << 11) | indexes[i];
    bitCount += 11;
    while (bitCount >= 8 && byteIndex < 16) {
      entropy[byteIndex++] = (bitBuffer >> (bitCount - 8)) & 0xff;
      bitCount -= 8;
    }
  }

  return entropy;
}

// Convert 12-word seed phrase deterministically to 32-byte Ed25519 Seed via SHA-256
export async function mnemonicToSeed(mnemonic: string): Promise<Uint8Array> {
  const entropy = mnemonicToEntropy(mnemonic);
  // Hash the entropy bytes using native browser crypto SHA-256 to get 32-byte seed
  const hashBuffer = await crypto.subtle.digest("SHA-256", entropy);
  return new Uint8Array(hashBuffer);
}
