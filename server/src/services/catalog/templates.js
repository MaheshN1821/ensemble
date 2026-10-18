// Example files a retailer can download and edit. The image links are placeholders that will not import as they are.
export const TEMPLATE_CSV = [
  'id,type,name,price,image_url,garment_category,colours,metal_tone,formality,occasion_tags,product_url,style,silhouette',
  'S-101,outfit,Maroon silk saree,14500,https://example.com/images/maroon-saree.png,full_body,maroon|gold,,5,wedding-guest|festive,https://example.com/p/s-101,traditional,saree',
  'K-204,outfit,Mustard cotton kurta set,3800,https://example.com/images/mustard-kurta.png,full_body,,,2,festive|brunch,,traditional,kurta-set',
  'J-310,necklace,Gold kundan necklace,8400,https://example.com/images/kundan-necklace.png,,,gold,5,wedding-guest|sangeet-mehendi,,traditional,',
  'J-415,earrings,Silver stud earrings,900,https://example.com/images/silver-studs.png,,,silver,2,office|brunch,,contemporary,',
  'L-501,lipstick,Brick red lipstick,520,https://example.com/images/brick-lipstick.png,,#A03F2E,,3,,,,',
].join('\n');

export const TEMPLATE_JSON = JSON.stringify({
  items: [
    { id: 'S-101', type: 'outfit', name: 'Maroon silk saree', price: 14500, image_url: 'https://example.com/images/maroon-saree.png', garment_category: 'full_body', colours: ['maroon', 'gold'], formality: 5, occasion_tags: ['wedding-guest', 'festive'], product_url: 'https://example.com/p/s-101', style: 'traditional', silhouette: 'saree' },
    { id: 'J-310', type: 'necklace', name: 'Gold kundan necklace', price: 8400, image_url: 'https://example.com/images/kundan-necklace.png', metal_tone: 'gold', formality: 5, occasion_tags: ['wedding-guest', 'sangeet-mehendi'] },
    { id: 'L-501', type: 'lipstick', name: 'Brick red lipstick', price: 520, image_url: 'https://example.com/images/brick-lipstick.png', colours: ['#A03F2E'] },
  ],
}, null, 2);

export const TEMPLATE_NOTES = [
  'type: outfit, necklace, earrings or lipstick',
  'price: whole rupees',
  'image_url: a direct https link to a .jpg or .png (plain background works best)',
  'garment_category (outfits): full_body, upper_body, lower_body or outerwear. Blank means full_body',
  'colours: optional. Names or hex codes separated by |. Leave blank and we read them from the photo',
  'metal_tone (necklaces and earrings): gold, silver, rose gold or oxidised',
  'formality: 1 (casual) to 5 (very formal). Lipstick can leave it blank',
  'occasion_tags: separated by |. Allowed: wedding-guest, sangeet-mehendi, festive, office, interview, date-night, brunch, cocktail',
];
