/** Niveles de precio: cliente normal, revendedor PRO y mayorista. */
export type PriceTier = "public" | "pro" | "wholesale";

export type TieredPack = {
  price: number;
  pricePro?: number;
  priceWholesale?: number;
};

/** Precio que le corresponde al usuario según su nivel (nunca expone el costo). */
export function packPrice(pack: TieredPack, tier: PriceTier): number {
  if (tier === "pro" && Number(pack.pricePro) > 0) return Number(pack.pricePro);
  if (tier === "wholesale" && Number(pack.priceWholesale) > 0) return Number(pack.priceWholesale);
  return Number(pack.price);
}

export const tierLabel: Record<PriceTier, string> = {
  public: "Cliente",
  pro: "Revendedor PRO",
  wholesale: "Mayorista",
};
