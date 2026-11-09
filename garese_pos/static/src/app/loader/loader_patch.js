

import { onWillUnmount, useState } from "@odoo/owl";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { Loader } from "@point_of_sale/app/components/loader/loader";

// Translations are not loaded yet while the loader is displayed: French is built in.
const FR = {
    "Preparing your register...": "Préparation de votre caisse...",
    "Loading products and prices...": "Chargement des produits et des prix...",
    "Checking the stock...": "Vérification du stock...",
    "Almost ready...": "Presque prêt...",
};

function gpIsFrench() {
    const lang = document.documentElement.lang || navigator.language || "";
    return lang.toLowerCase().startsWith("fr");
}

/** Friendly messages that follow the loading of the register. */
patch(Loader.prototype, {
    setup() {
        super.setup(...arguments);
        this.gpState = useState({ index: 0 });
        // The loader is drawn before the translations are loaded: `_t` must
        // not be evaluated at setup, only read back safely (English fallback).
        this.gpMessages = [
            ["Preparing your register...", () => _t("Preparing your register...")],
            ["Loading products and prices...", () => _t("Loading products and prices...")],
            ["Checking the stock...", () => _t("Checking the stock...")],
            ["Almost ready...", () => _t("Almost ready...")],
        ];
        const timer = setInterval(() => {
            if (this.gpState.index < this.gpMessages.length - 1) {
                this.gpState.index++;
            }
        }, 1800);
        onWillUnmount(() => clearInterval(timer));
    },
    get gpMessage() {
        const [fallback, translate] = this.gpMessages[this.gpState.index];
        let text = fallback;
        try {
            text = String(translate());
        } catch {
            // translations not loaded yet
        }
        return text === fallback && gpIsFrench() ? FR[fallback] : text;
    },
});
