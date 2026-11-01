// Example files a retailer can download and edit. The image links are placeholders that will not import as they are.
export const TEMPLATE_CSV = [
  'id,type,name,price,image_url,gender,category,garment_category,colours,metal_tone,formality,occasion_tags,product_url,style,silhouette',
  'S-101,outfit,Maroon silk saree,14500,https://example.com/images/maroon-saree.png,women,saree,full_body,maroon|gold,,5,wedding-guest|festive,https://example.com/p/s-101,traditional,saree',
  'M-201,outfit,Navy tailored blazer and trousers,9500,https://example.com/images/navy-suit.png,men,formal,full_body,navy,,4,office|cocktail|wedding-guest,https://example.com/p/m-201,contemporary,suit',
  'W-204,outfit,Floral summer brunch dress,3200,https://example.com/images/brunch-dress.png,women,casual,full_body,pink|cream,,2,brunch|date-night,,contemporary,dress',
  'M-105,outfit,White breathable linen shirt,2400,https://example.com/images/linen-shirt.png,men,casual,upper_body,white,,2,brunch|date-night,,contemporary,shirt',
  'J-415,earrings,Silver stud earrings,900,https://example.com/images/silver-studs.png,women,,,silver,2,office|brunch,,contemporary,',
  'E-601,eyewear,Classic tortoiseshell acetate frames,2800,https://example.com/images/tortoise-glasses.png,unisex,,,,,2,office|brunch|date-night,,contemporary,',
  'W-701,watch,Chronograph leather strap watch,6500,https://example.com/images/leather-watch.png,men,,,,,3,office|cocktail|wedding-guest,,contemporary,',
  'L-501,lipstick,Brick red satin lipstick,520,https://example.com/images/brick-lipstick.png,women,,,,#A03F2E,,3,office|festive|party,,contemporary,',
  'B-801,blush,Rose pinnacle soft matte blush,450,https://example.com/images/rose-blush.png,women,,,,#DE6B7E,,3,office|brunch|festive,,contemporary,',
  'F-804,foundation,Smooth poreless liquid foundation,599,https://example.com/images/foundation.png,unisex,,,,#D59B6A,,3,office|party|festive,,contemporary,',
].join('\n');

export const TEMPLATE_JSON = JSON.stringify({
  items: [
    { id: 'S-101', type: 'outfit', name: 'Maroon silk saree', price: 14500, image_url: 'https://example.com/images/maroon-saree.png', gender: 'women', category: 'saree', garment_category: 'full_body', colours: ['maroon', 'gold'], formality: 5, occasion_tags: ['wedding-guest', 'festive'], product_url: 'https://example.com/p/s-101', style: 'traditional', silhouette: 'saree' },
    { id: 'M-201', type: 'outfit', name: 'Navy tailored blazer and trousers', price: 9500, image_url: 'https://example.com/images/navy-suit.png', gender: 'men', category: 'formal', garment_category: 'full_body', colours: ['navy'], formality: 4, occasion_tags: ['office', 'cocktail'] },
    { id: 'J-415', type: 'earrings', name: 'Silver stud earrings', price: 900, image_url: 'https://example.com/images/silver-studs.png', gender: 'women', metal_tone: 'silver', formality: 2, occasion_tags: ['office', 'brunch'] },
    { id: 'E-601', type: 'eyewear', name: 'Classic tortoiseshell acetate frames', price: 2800, image_url: 'https://example.com/images/tortoise-glasses.png', gender: 'unisex', formality: 2, occasion_tags: ['office', 'brunch'] },
    { id: 'W-701', type: 'watch', name: 'Chronograph leather strap watch', price: 6500, image_url: 'https://example.com/images/leather-watch.png', gender: 'men', formality: 3, occasion_tags: ['office', 'cocktail'] },
    { id: 'L-501', type: 'lipstick', name: 'Brick red satin lipstick', price: 520, image_url: 'https://example.com/images/brick-lipstick.png', gender: 'women', colours: ['#A03F2E'], occasion_tags: ['office', 'festive', 'party'] },
    { id: 'B-801', type: 'blush', name: 'Rose pinnacle soft matte blush', price: 450, image_url: 'https://example.com/images/rose-blush.png', gender: 'women', colours: ['#DE6B7E'], occasion_tags: ['office', 'brunch', 'festive'] },
    { id: 'F-804', type: 'foundation', name: 'Smooth poreless liquid foundation', price: 599, image_url: 'https://example.com/images/foundation.png', gender: 'unisex', colours: ['#D59B6A'], occasion_tags: ['office', 'party', 'festive'] },
  ],
}, null, 2);

export const TEMPLATE_NOTES = [
  'type: outfit, earrings, lipstick, blush, foundation, eyewear, watch',
  'gender: women, men, unisex, or all (defaults to women for saree/earrings/lipstick/blush, unisex for eyewear/foundation, men for watch)',
  'category (outfits): casual, party, saree, formal, festive',
  'price: whole rupees',
  'image_url: a direct https link to a .jpg or .png (plain background works best)',
  'garment_category (outfits): full_body, upper_body, lower_body or outerwear. Blank means full_body',
  'colours: hex codes (e.g. #DE6B7E, #D59B6A) or names (maroon|gold). Crucial for makeup (lipstick, blush, foundation) so the AI applies the exact shade to the face',
  'metal_tone (earrings and watches): gold, silver, rose gold or oxidised',
  'formality: 1 (casual) to 5 (very formal). Makeup items can leave it blank (defaults to 3)',
  'occasion_tags: separated by |. Allowed: wedding-guest, sangeet-mehendi, festive, office, interview, date-night, brunch, cocktail',
];
