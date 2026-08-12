import game1 from "@/assets/game-1.jpg";
import game2 from "@/assets/game-2.jpg";
import game3 from "@/assets/game-3.jpg";
import game4 from "@/assets/game-4.jpg";
import stream1 from "@/assets/stream-1.jpg";
import gift1 from "@/assets/gift-1.jpg";

export type Product = {
  name: string;
  tag: string;
  image: string;
  hot?: boolean;
};

export type Category = {
  id: string;
  icon: string;
  label: string;
  items: Product[];
};

export const categories: Category[] = [
  {
    id: "populares",
    icon: "🔥",
    label: "Populares",
    items: [
      { name: "Free Fire", tag: "Recarga", image: game1, hot: true },
      { name: "Free Fire — Pases de Nivel", tag: "Recarga", image: game2, hot: true },
      { name: "Blood Strike", tag: "Recarga", image: game4, hot: true },
      { name: "Roblox", tag: "Recarga", image: game3, hot: true },
      { name: "Mobile Legends", tag: "Recarga", image: game4, hot: true },
    ],
  },
  {
    id: "juegos",
    icon: "🎮",
    label: "Juegos",
    items: [
      { name: "Farlight 84", tag: "Recarga", image: game2 },
      { name: "PUBG Mobile", tag: "Recarga", image: game1 },
      { name: "Honor of Kings", tag: "Recarga", image: game4 },
      { name: "Arena Breakout", tag: "Recarga", image: game2 },
      { name: "Marvel Rivals", tag: "Recarga", image: game4 },
      { name: "Identity V", tag: "Recarga", image: game3 },
      { name: "Delta Force", tag: "Recarga", image: game2 },
      { name: "Genshin Impact", tag: "Recarga", image: game4 },
      { name: "Call of Duty Mobile", tag: "Recarga", image: game1 },
      { name: "Clash of Clans", tag: "Recarga", image: game3 },
      { name: "Valorant", tag: "Recarga", image: game2 },
      { name: "League of Legends", tag: "Recarga", image: game4 },
    ],
  },
  {
    id: "streaming",
    icon: "📺",
    label: "Streaming",
    items: [
      { name: "Netflix", tag: "Suscripción", image: stream1 },
      { name: "Disney+", tag: "Suscripción", image: stream1 },
      { name: "HBO Max", tag: "Suscripción", image: stream1 },
      { name: "Spotify", tag: "Suscripción", image: stream1 },
      { name: "Prime Video", tag: "Suscripción", image: stream1 },
      { name: "Crunchyroll", tag: "Suscripción", image: stream1 },
    ],
  },
  {
    id: "giftcards",
    icon: "🎁",
    label: "Gift Cards",
    items: [
      { name: "PlayStation Store", tag: "Gift Card", image: gift1 },
      { name: "Xbox Game Pass", tag: "Gift Card", image: gift1 },
      { name: "Steam Wallet", tag: "Gift Card", image: gift1 },
      { name: "Google Play", tag: "Gift Card", image: gift1 },
      { name: "App Store", tag: "Gift Card", image: gift1 },
      { name: "Amazon", tag: "Gift Card", image: gift1 },
    ],
  },
];
