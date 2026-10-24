import { useState } from 'react'
import { Sheet } from '../ui/Sheet'

/** Food emoji with words to find them by. */
const FOOD: [string, string][] = [
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

/** Pick the emoji for a meal's card: tap one, search by word, or type any emoji. */
export function EmojiPicker({ open, value, onPick, onClose }: { open: boolean; value: string; onPick: (emoji: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()
  const typed = query && !/^[\x00-\x7f]*$/.test(query) ? q.trim() : null // an emoji from the keyboard
  const shown = query && !typed ? FOOD.filter(([, words]) => words.includes(query)) : FOOD
  const pick = (emoji: string) => { onPick(emoji); setQ(''); onClose() }
  return (
    <Sheet open={open} onClose={onClose} label="Choose an emoji">
      <h1>Choose an emoji</h1>
      <label className="field" style={{ marginBottom: 12 }}>
        Search, or type any emoji
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. pancakes" autoComplete="off" />
      </label>
      {typed && <button className="btn ghost" style={{ marginBottom: 12 }} onClick={() => pick(typed)}>Use {typed}</button>}
      <div className="emoji-grid" role="group" aria-label="Food emoji">
        {shown.map(([emoji, words]) => (
          <button key={emoji} type="button" aria-label={words.split(' ')[0]} aria-pressed={emoji === value} onClick={() => pick(emoji)}>{emoji}</button>
        ))}
      </div>
      {!shown.length && !typed && <p className="sub">Nothing for “{q}”. Type the emoji itself from your keyboard.</p>}
    </Sheet>
  )
}
