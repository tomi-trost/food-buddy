/** Food emoji with words to find them by. */
export const FOOD: [string, string][] = [
  ['🍝', 'pasta spaghetti noodles'], ['🍜', 'ramen noodles soup pho'], ['🍲', 'stew pot curry goulash'], ['🥘', 'paella pan casserole'],
  ['🍛', 'curry rice'], ['🍚', 'rice bowl'], ['🍙', 'rice ball onigiri'], ['🍣', 'sushi fish'], ['🍱', 'bento lunch box'],
  ['🥗', 'salad greens bowl'], ['🥙', 'wrap pita kebab'], ['🌯', 'burrito wrap tortilla'], ['🌮', 'taco mexican'], ['🫔', 'tamale'],
  ['🍕', 'pizza'], ['🍔', 'burger hamburger'], ['🌭', 'hot dog sausage'], ['🥪', 'sandwich toast panini'], ['🍟', 'fries chips potato'],
  ['🥟', 'dumpling ravioli'], ['🫕', 'fondue'], ['🥣', 'bowl cereal oats porridge muesli granola'], ['🥞', 'pancakes crepes'],
  ['🧇', 'waffle'], ['🥐', 'croissant pastry'], ['🥯', 'bagel'], ['🍞', 'bread loaf toast'], ['🥖', 'baguette bread'], ['🫓', 'flatbread focaccia'],
  ['🥨', 'pretzel'], ['🧀', 'cheese'], ['🥚', 'egg'], ['🍳', 'fried egg breakfast omelette shakshuka'], ['🥓', 'bacon'],
  ['🍗', 'chicken drumstick'], ['🍖', 'meat ribs'], ['🥩', 'steak beef meat'], ['🐟', 'fish'], ['🦐', 'shrimp prawn'], ['🦑', 'squid calamari'],
  ['🫘', 'beans lentils chickpeas legumes'], ['🥜', 'peanuts nuts'], ['🌰', 'chestnut nut'], ['🥔', 'potato'], ['🍠', 'sweet potato'],
  ['🥕', 'carrot'], ['🥦', 'broccoli vegetables'], ['🥬', 'greens spinach kale cabbage'], ['🥒', 'cucumber'], ['🫑', 'pepper paprika'],
  ['🌶️', 'chili hot'], ['🍅', 'tomato'], ['🍆', 'eggplant aubergine'], ['🧅', 'onion'], ['🧄', 'garlic'], ['🍄', 'mushroom'], ['🌽', 'corn'],
  ['🫛', 'peas'], ['🥑', 'avocado guacamole'], ['🫒', 'olive'], ['🎃', 'pumpkin squash'], ['🍎', 'apple'], ['🍐', 'pear'], ['🍊', 'orange'],
  ['🍋', 'lemon'], ['🍌', 'banana'], ['🍉', 'watermelon'], ['🍇', 'grapes'], ['🍓', 'strawberry berries'], ['🫐', 'blueberries berries'],
  ['🍒', 'cherries'], ['🍑', 'peach'], ['🥭', 'mango'], ['🍍', 'pineapple'], ['🥝', 'kiwi'], ['🥥', 'coconut'], ['🍦', 'ice cream'],
  ['🍨', 'gelato ice cream'], ['🍧', 'sorbet shaved ice'], ['🍰', 'cake slice tiramisu'], ['🎂', 'birthday cake'], ['🧁', 'cupcake muffin'],
  ['🥧', 'pie tart quiche'], ['🍮', 'pudding flan custard'], ['🍫', 'chocolate'], ['🍬', 'candy sweet'], ['🍪', 'cookie biscuit biscotti'],
  ['🍩', 'donut'], ['🍯', 'honey'], ['🥛', 'milk'], ['🫖', 'tea'], ['☕', 'coffee espresso'], ['🧃', 'juice box'], ['🥤', 'soda drink smoothie'],
  ['🧋', 'bubble tea'], ['🍺', 'beer'], ['🍷', 'wine'], ['🥂', 'prosecco champagne'], ['🍽️', 'plate meal dinner'],
]

/** Same word, one of them maybe plural (pancake / pancakes, tomato / tomatoes). */
const same = (a: string, b: string) => [a, `${a}s`, `${a}es`].includes(b) || [b, `${b}s`, `${b}es`].includes(a)

/** An emoji for a dish name: the last word that names a food wins ("Banana pancakes" → 🥞, not 🍌),
 *  since the dish usually comes last; null when no word matches. */
export function guessEmoji(name: string): string | null {
  const words = name.toLowerCase().match(/[^\W\d_]{3,}/gu) ?? []
  for (const w of words.reverse()) {
    const hit = FOOD.find(([, ws]) => ws.split(' ').some((f) => same(f, w)))
    if (hit) return hit[0]
  }
  return null
}
