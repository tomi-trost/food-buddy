// Mirrors the FastAPI response models (api/app/**/schemas). TODO(M4): generate from /api/openapi.json.

export type Nutrients = {
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  sugar: number
}

export type Ingredient = {
  id: number
  name: string
  emoji: string
  category: string
  location: 'fridge' | 'pantry'
  price_per_100g: number
  per100: Nutrients
  unit: 'g' | 'ml' | 'pc' | 'slice' | 'clove' // shown and typed like this; stored in grams
  unit_grams: number // grams per piece/slice/clove, g per ml, or 1
  tbsp_g: number // one level tablespoon weighs this (a teaspoon is a third)
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' // what the weekly plan fills
/** Snacks are meals too (decision 0025). */
export type MealKind = MealType | 'snack'

export type AnalysisItem = {
  name: string
  grams: number
  confidence: number
  ingredient: (Ingredient & { score: number }) | null
  nutrients: Nutrients | null
}

/** A 7-step slider: −3…+3, 0 = meh / just right. */
export type Slider = -3 | -2 | -1 | 0 | 1 | 2 | 3

export type Rating = {
  taste: number // 0.5–5 in half steps
  again: 1 | 3 | 5
  effort: Slider | null // worth the effort: not really … totally; null for snacks (not cooked)
  fill: Slider | null // how filling: left us hungry … too heavy; null for snacks
  note?: string | null
}

/** score: taste, again and effort, for sorting and the menu; taste: what the stars show. */
export type MealStats = { score: number | null; taste: number | null; cooked_count: number; last_cooked: string | null }

/** How a meal is logged as a snack: per portion, per piece of piece_g grams, or per 100 g / ml. */
export type MealPer = 'portion' | 'piece' | '100g' | '100ml'

export type SnackInfo = {
  snack_kind: SnackKind | null // set while it's a snack
  per: MealPer
  piece_g: number | null
  is_product: boolean // scanned / label: one ingredient with the pack's values
  per_unit: Nutrients // values for one portion / piece, or per 100 g / ml
  portion_g: number // grams in one portion
}

/** Cooked by us, bought in a shop or eaten out. Bought / out food is logged for its nutrition
 *  only (one portion, cost = what we paid) and isn't in our meals unless saved there (listed). */
export type Origin = 'home' | 'bought' | 'out'
export type OriginInfo = { origin: Origin; listed: boolean; place: string | null; family: string; family_picked: boolean } // family: dish family, ours or guessed

export type MealCard = MealStats & SnackInfo & OriginInfo & {
  id: number
  name: string
  emoji: string
  photo_url: string | null
  types: MealKind[]
  tags: string[]
  prep_minutes: number
  portions: number
  cost: number
  rated_by_me: boolean
  kcal_per_portion: number
  per_portion: Nutrients
  bundle: boolean // holds other meals of ours (so it can't be a dish itself)
  created_at: string
}

export type MealRef = { id: number; name: string; emoji: string }

/** A dish on a plate (bundle): `portions` of one of our meals in the whole recipe. */
export type MealComponent = MealRef & {
  portions: number
  grams: number
  photo_url: string | null
  per_portion: Nutrients // one portion of the dish
  cost: number // for these portions
  ingredients: { ingredient: Ingredient; grams: number }[] // for these portions
}

/** An existing meal of ours (`meal_id`) or a new one made from some of the plate's ingredients
 *  (`new.items` = grams for ONE portion of it, `new.portions` = portions made). */
export type ComponentIn = {
  meal_id?: number
  new?: { name: string; portions: number; items: { ingredient_id: number; grams: number }[]; emoji?: string }
  portions: number
  aliases?: string[] // what the photo called the items it took the place of
}

export type Meal = MealStats & SnackInfo & OriginInfo & {
  id: number
  name: string
  emoji: string
  photo_url: string | null
  types: MealKind[]
  tags: string[]
  prep_minutes: number
  portions: number
  cost: number
  cost_estimated: boolean
  steps: string[]
  steps_source: 'template' | 'model' | 'ours'
  ingredients: { ingredient: Ingredient; grams: number }[]
  components: MealComponent[] // bundles: our other meals on the plate
  used_in: MealRef[] // plates this meal is a dish of
  aliases: string[] // what photos call it (offered as a swap when checking a photo)
  per_portion: Nutrients // what counts: typed-in values if any, else calculated
  per_portion_calculated: Nutrients
  nutrients_overridden: boolean
  logged_count: number // food-log entries (both of us)
  ratings: { user_id: number; name: string; color: string; rating: Rating | null }[]
  created_at: string
  undo_until: string | null // for whoever posted it, while the post can be undone
}

/** cooked: false = leftovers / my partner cooked it: logged, stock untouched.
 *  Snacks: `amount` in the meal's unit (pieces, grams, ml or portions). */
export type CookIn = {
  meal_type: MealKind
  eaten_on: string
  servings_eaten?: number
  amount?: number
  cooked: boolean
  used_up: number[]
}

export type MealCreate = {
  name: string
  meal_type: MealKind
  eaten: boolean // false = save for later: library only, not logged
  eaten_on: string | null
  prep_minutes: number
  portions: number
  servings_eaten: number
  cost: number | null
  items: { ingredient_id: number; grams: number }[]
  components?: ComponentIn[] // per plate, like items
  used_up: number[]
  analysis_id: number | null
  per_portion?: Nutrients | null // typed in instead of the ingredients' values
  snack_kind?: SnackKind | null // snacks
  per?: MealPer
  piece_g?: number | null
  origin?: Origin
  place?: string | null
}

export type AnalysisResult = {
  dish: string
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  servings: number
  items: AnalysisItem[]
  totals: Nutrients
  unmatched: number
}

export type SnackKind = 'sweet' | 'savory' | 'fruit' | 'drink' // fruit never counts as a treat

/** Values per piece (amount = pieces), or per 100 g / 100 ml (amount = grams / ml). */
export type SnackPer = 'portion' | 'piece' | '100g' | '100ml'

export type SnackResult = {
  name: string
  kind: SnackKind
  per: SnackPer
  amount: number
  per_unit: Nutrients
}

export type AnalysisJob = {
  id: number
  by: { id: number; name: string } // who took the photo
  kind: 'meal' | 'snack' | 'label'
  status: 'queued' | 'running' | 'done' | 'failed'
  photo_url: string | null // null: typed, not snapped
  description: string | null // what was typed
  provider: string | null
  result: AnalysisResult | null
  snack: SnackResult | null
  error: string | null
  created_at: string
  finished_at: string | null
  closed: boolean // posted, logged or discarded
  meal_type: MealKind | null // chosen on the Snap screen
  save_only: boolean // "for later": not eaten now
  meal_id: number | null
  my_rating: Rating | null // given while the photo was still being analyzed
  dishes: DishSuggestion[] // items that may be one of our dishes (aliases): ask before swapping
}

/** One of our meals as a dish on a plate (enough to show and count a portion of it). */
export type DishSource = Pick<MealCard, 'id' | 'name' | 'emoji' | 'portions' | 'portion_g' | 'cost' | 'per_portion'>

/** "Pancakes — your Healthy banana pancakes?": `item` is the index in the result's items. */
export type DishSuggestion = { item: number; name: string; dish: DishSource }

export type Member = { id: number; name: string; color: string }

export type Goals = { kcal: number; protein: number; fiber: number; sugar: number }

export type Me = {
  id: number
  email: string
  name: string
  color: string
  goals: Goals
  household: {
    id: number
    name: string
    invite_code: string
    reward_per: number
    reward_cap: number
    members: Member[]
  }
}

export type MePatch = Partial<{
  name: string
  goal_kcal: number
  goal_protein: number
  goal_fiber: number
  goal_sugar: number
}>

export type HouseholdPatch = Partial<{ name: string; reward_per: number; reward_cap: number }>

export type RegisterBody = {
  email: string
  password: string
  name: string
  household_name?: string
  invite_code?: string
}

export type StockItem = { ingredient: Ingredient; grams: number; expires_on: string; days_left: number }

export type PlanMode = 'cook' | 'prep' | 'out' | 'skip'
export type WizardCell = { mode: PlanMode; minutes: number | null }

export type PlanSlot = { meal_type: MealType; mode: PlanMode; minutes: number | null; meal: MealCard | null }

export type Plan = {
  id: number
  week_start: string
  status: 'draft' | 'approved'
  wizard: WizardCell[][]
  days: { date: string; kcal: number; slots: PlanSlot[] }[]
  approvals: { user_id: number; name: string; color: string; approved: boolean }[]
  summary: {
    cook: number
    prep: number
    out: number
    skip: number
    grocery_cost: number
    batch_cook: { meal_id: number; name: string; times: number }[]
  }
}

export type ShoppingItem = {
  ingredient: Ingredient
  need: number
  have: number
  buy: number
  ran_out: boolean
  checked: boolean
}

export type Shopping = { plan_approved: boolean; items: ShoppingItem[]; in_stock: Ingredient[]; total: number }

/** Only the fields sent change. cost null = estimate again; per_portion null = calculate again. */
export type MealPatch = Partial<{
  name: string
  emoji: string // the card without a photo
  types: MealKind[]
  prep_friendly: boolean
  prep_minutes: number
  portions: number
  cost: number | null
  items: { ingredient_id: number; grams: number }[] // whole recipe
  components: ComponentIn[] // whole recipe
  per_portion: Nutrients | null
  steps: string[] // sets steps_source to 'ours'
  snack_kind: SnackKind
  per: MealPer
  piece_g: number
  product_per100: Nutrients // products: the pack's values
  listed: boolean // bought / eaten out: true = save to our meals
  family: string // dish family; '' = guess it again
  aliases: string[] // what photos call it
}>

export type LogEntry = {
  id: number
  meal_type: MealType | 'snack'
  name: string
  emoji: string
  kind: 'meal' | 'snack'
  snack_kind: SnackKind | null
  is_reward: boolean
  meal_id: number | null
  nutrients: Nutrients
  logged_at: string // ISO time it was logged: places snacks between the meals
  servings: number // portions (meals), pieces or grams (snacks)
  per: SnackPer | null // snacks
  per_unit: Nutrients | null // snacks: values per piece / per 100 g / per 100 ml
}

/** Meals: portions and which meal it was. Snacks: amount and values per unit. */
export type LogPatch = Partial<{ servings: number; meal_type: MealType; per_unit: Nutrients }>

export type Day = { date: string; totals: Nutrients; entries: LogEntry[] }

export type DayTotals = Nutrients & { date: string; treats: number; treat_sugar: number }

export type MemberInsights = {
  user_id: number
  name: string
  color: string
  goals: Goals
  meals_rated: number
  days: DayTotals[]
  not_cooked: { out: number; bought: number; spent: number } // over the range
  meal_counts: Record<MealKind, number> // entries per meal type over the range
}

/** A family we put meals in, and what it learned from them to guess new meals into it. */
export type LearnedFamily = {
  name: string
  members: number // meals we put in it ourselves (it learns from 2)
  words: string[]
  ingredients: { id: number; name: string }[]
  blocked_words: string[]
  blocked_ingredients: { id: number; name: string }[]
}

export type SourceGroup = 'protein' | 'carbs' | 'fat' | 'fiber' | 'sugar'
/** The ingredients someone ate most, under the nutrient they bring (most often first). */
export type Sources = { groups: Record<SourceGroup, { name: string; emoji: string; times: number; grams: number }[]> }

export type Insights = { members: MemberInsights[] }

export type CatalogItem = { key: string; name: string; emoji: string; kind: SnackKind; per_unit: Nutrients }

export type SnackIn = {
  eaten_on: string
  name: string
  emoji: string
  kind: SnackKind
  source: 'list' | 'photo' | 'label' | 'saved' | 'barcode'
  per: SnackPer
  amount: number
  per_unit: Nutrients
  analysis_id?: number
  save?: boolean // also keep it in our snacks: a product meal (with the photo, if any)
  barcode?: string // scanned: the household remembers it as logged
  piece_g?: number // scanned and counted (per: 'piece'): one piece weighs this
  piece_base?: '100g' | '100ml' // …in grams or ml
}

/** A packaged product from Open Food Facts, looked up by its barcode. */
export type Product = {
  code: string
  name: string
  brand: string
  quantity: string // pack size as printed, e.g. "400 g"
  per: '100g' | '100ml' // drinks: per100 and serving_g are per 100 ml / ml
  serving_g: number | null
  piece_g: number | null // counted in pieces last time: one piece weighs this
  image_url: string | null
  per100: Nutrients | null // null: OFF has no values, type them from the label
  kind: SnackKind // guessed from OFF's categories and the sugar
  remembered: boolean // our values (name, type, values, amount) from the last time we logged it
  meal_id: number | null // in our snacks: logging it updates that product
  source: string
  ingredient: Ingredient | null // we cook with it: the ingredient made from this barcode
}

/** A scanned pack to cook with, as we checked it. */
export type IngredientFromCode = { name: string; per: '100g' | '100ml'; per100: Nutrients; piece_g: number | null }

export type SnackLogged = { id: number; name: string; kcal: number; sugar: number; treat: boolean; meal_id: number | null }


export type Reward = {
  user_id: number
  name: string
  color: string
  treat_free_days: number
  earned: number
  used: number
  available: number
  progress: number
  per: number
}

export type PushKind = 'ready' | 'rate' | 'partner' | 'shared' | 'plan' | 'daily' | 'goal'

/** A meal the other one logged: "you too?" */
export type Suggestion = {
  id: number
  by: { id: number; name: string; color: string }
  meal: { id: number; name: string; emoji: string; photo_url: string | null; kcal_per_portion: number }
  meal_type: MealKind
  eaten_on: string
}
export type PushConfig = { enabled: boolean; public_key: string | null; off: PushKind[] }
