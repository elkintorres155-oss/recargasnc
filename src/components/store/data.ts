import game1 from "@/assets/game-1.jpg";
import game2 from "@/assets/game-2.jpg";
import game3 from "@/assets/game-3.jpg";
import game4 from "@/assets/game-4.jpg";
import stream1 from "@/assets/stream-1.jpg";
import gift1 from "@/assets/gift-1.jpg";

export type Pack = {
  id: string;
  label: string;
  price: number; // córdobas (NIO)
  sku?: string; // código/SKU del proveedor (ej. FlashTopUp)
  /** Existencias disponibles. Vacío/null = ilimitado, 0 = agotado. */
  stock?: number | null;
};

export type Product = {
  id: string;
  name: string;
  tag: string;
  image: string;
  hot?: boolean;
  needsId?: boolean;
  providerProductId?: string; // ID del producto en el proveedor (ej. freefire)
  packs: Pack[];
};

export type Category = {
  id: string;
  icon: string;
  label: string;
  items: Product[];
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function packs(list: [string, number][]): Pack[] {
  return list.map(([label, price]) => ({ id: slug(label), label, price }));
}

const diamantes = packs([
  ["100 Diamantes", 65],
  ["310 Diamantes", 185],
  ["520 Diamantes", 300],
  ["1060 Diamantes", 590],
  ["2180 Diamantes", 1180],
  ["5600 Diamantes", 2950],
]);

const robux = packs([
  ["80 Robux", 45],
  ["400 Robux", 210],
  ["800 Robux", 400],
  ["1700 Robux", 830],
  ["4500 Robux", 2150],
]);

const genericos = packs([
  ["Paquete pequeño", 120],
  ["Paquete mediano", 320],
  ["Paquete grande", 640],
  ["Paquete premium", 1250],
]);

const suscripcion = packs([
  ["1 mes", 290],
  ["3 meses", 820],
  ["6 meses", 1550],
  ["12 meses", 2900],
]);

const giftcards = packs([
  ["C$ 400", 400],
  ["C$ 750", 750],
  ["C$ 1,500", 1500],
  ["C$ 3,000", 3000],
]);

function make(
  name: string,
  tag: string,
  image: string,
  list: Pack[],
  extra?: { hot?: boolean; needsId?: boolean },
): Product {
  return { id: slug(name), name, tag, image, packs: list, ...extra };
}

export const categories: Category[] = [
  {
    id: "populares",
    icon: "🔥",
    label: "Populares",
    items: [
      make("Free Fire", "Recarga", game1, diamantes, { hot: true, needsId: true }),
      make("Free Fire — Pases de Nivel", "Recarga", game2, genericos, {
        hot: true,
        needsId: true,
      }),
      make("Blood Strike", "Recarga", game4, genericos, { hot: true, needsId: true }),
      make("Roblox", "Recarga", game3, robux, { hot: true, needsId: true }),
      make("Mobile Legends", "Recarga", game4, diamantes, { hot: true, needsId: true }),
    ],
  },
  {
    id: "juegos",
    icon: "🎮",
    label: "Juegos",
    items: [
      make("Farlight 84", "Recarga", game2, genericos, { needsId: true }),
      make("PUBG Mobile", "Recarga", game1, genericos, { needsId: true }),
      make("Honor of Kings", "Recarga", game4, genericos, { needsId: true }),
      make("Arena Breakout", "Recarga", game2, genericos, { needsId: true }),
      make("Marvel Rivals", "Recarga", game4, genericos, { needsId: true }),
      make("Identity V", "Recarga", game3, genericos, { needsId: true }),
      make("Delta Force", "Recarga", game2, genericos, { needsId: true }),
      make("Genshin Impact", "Recarga", game4, genericos, { needsId: true }),
      make("Call of Duty Mobile", "Recarga", game1, genericos, { needsId: true }),
      make("Clash of Clans", "Recarga", game3, genericos, { needsId: true }),
      make("Valorant", "Recarga", game2, genericos, { needsId: true }),
      make("League of Legends", "Recarga", game4, genericos, { needsId: true }),
    ],
  },
  {
    id: "streaming",
    icon: "📺",
    label: "Streaming",
    items: [
      make("Netflix", "Suscripción", stream1, suscripcion),
      make("Disney+", "Suscripción", stream1, suscripcion),
      make("HBO Max", "Suscripción", stream1, suscripcion),
      make("Spotify", "Suscripción", stream1, suscripcion),
      make("Prime Video", "Suscripción", stream1, suscripcion),
      make("Crunchyroll", "Suscripción", stream1, suscripcion),
    ],
  },
  {
    id: "giftcards",
    icon: "🎁",
    label: "Gift Cards",
    items: [
      make("PlayStation Store", "Gift Card", gift1, giftcards),
      make("Xbox Game Pass", "Gift Card", gift1, giftcards),
      make("Steam Wallet", "Gift Card", gift1, giftcards),
      make("Google Play", "Gift Card", gift1, giftcards),
      make("App Store", "Gift Card", gift1, giftcards),
      make("Amazon", "Gift Card", gift1, giftcards),
    ],
  },
];

export const allProducts: Product[] = categories.flatMap((c) => c.items);

export function findProduct(id: string): Product | undefined {
  return allProducts.find((p) => p.id === id);
}
