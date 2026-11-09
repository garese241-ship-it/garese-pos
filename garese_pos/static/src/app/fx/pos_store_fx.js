import { patch } from "@web/core/utils/patch";
import { PosStore } from "@point_of_sale/app/services/pos_store";
import { gpFlyToCart, gpPlaySound, gpPulse } from "@garese_pos/app/fx/fx";

patch(PosStore.prototype, {
    get gpAnimationsOn() {
        return Boolean(this.config.gp_fx_animations) && !this.ui.isSmall;
    },
    gpSound(kind) {
        if (this.config.gp_fx_sounds) {
            gpPlaySound(kind);
        }
    },
    /** Feedback of a product added to the cart: flight, pulse, flash, sound. */
    gpAddFeedback(template) {
        this.gpSound("add");
        if (!this.gpAnimationsOn) {
            return;
        }
        const tile =
            template && document.querySelector(`article.gp-card[data-product-id="${template.id}"]`);
        const cart = document.querySelector(".gp-cart-icon");
        if (tile) {
            gpFlyToCart(tile, cart);
        }
        // The cart is re-rendered after the order changed: wait a frame.
        setTimeout(() => {
            gpPulse(document.querySelector(".gp-cart-count"));
            gpPulse(document.querySelector(".gp-summary-total-value"), "gp-bump", 500);
            const line = document.querySelector(".product-screen .order-container .orderline.selected");
            gpPulse(line, "gp-flash", 900);
            line?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
        }, 650);
    },
    gpOrderQuantity() {
        const order = this.getOrder();
        return order ? order.lines.reduce((sum, line) => sum + line.qty, 0) : 0;
    },
    async addLineToCurrentOrder(vals, opts = {}, configure = true) {
        const before = this.gpOrderQuantity();
        const result = await super.addLineToCurrentOrder(...arguments);
        let template = vals?.product_tmpl_id;
        if (typeof template === "number") {
            template = this.models["product.template"].get(template);
        }
        // Only when something was really added (a popup may have been dismissed).
        if (template && this.gpOrderQuantity() !== before) {
            this.gpAddFeedback(template);
            this.gpLowStockAlert(template);
        }
        return result;
    },
});
