import { patch } from "@web/core/utils/patch";
import { normalize } from "@web/core/l10n/utils";
import { PosStore } from "@point_of_sale/app/services/pos_store";

/** True when the two words differ by at most one insertion, deletion or substitution. */
function withinOneEdit(a, b) {
    if (a === b) {
        return true;
    }
    if (Math.abs(a.length - b.length) > 1) {
        return false;
    }
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) {
        i++;
    }
    if (a.length === b.length) {
        return a.slice(i + 1) === b.slice(i + 1); // substitution
    }
    return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/**
 * Accents are ignored by the standard search. GARESE adds the brand to the
 * searched text and, when nothing matches, tolerates a typo (one letter) in
 * each word typed.
 */
patch(PosStore.prototype, {
    getProductsBySearchWord(searchWord, products) {
        const list = [...products];
        const results = super.getProductsBySearchWord(searchWord, list);
        const query = normalize(searchWord || "").trim();
        if (!query) {
            return results;
        }
        // brand
        const byBrand = list.filter(
            (p) => p.gpBrandName && normalize(p.gpBrandName).includes(query) && !results.includes(p)
        );
        if (results.length || byBrand.length || query.length < 4) {
            return [...results, ...byBrand];
        }
        // typo tolerance
        const words = query.split(/\s+/).filter(Boolean);
        const found = [];
        for (const product of list) {
            const tokens = normalize(`${product.display_name || ""} ${product.gpBrandName || ""}`)
                .split(/[^a-z0-9]+/)
                .filter(Boolean);
            const matches = words.every((word) =>
                tokens.some(
                    (token) =>
                        token.startsWith(word) ||
                        (word.length >= 4 &&
                            (withinOneEdit(word, token) ||
                                withinOneEdit(word, token.slice(0, word.length))))
                )
            );
            if (matches) {
                found.push(product);
            }
        }
        return found;
    },
});
